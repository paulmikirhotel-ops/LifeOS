import mongoose from 'mongoose';
import { User, Membership, Task, Goal, CalendarEvent, Meeting, DailyNote, ConnectMessage } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { hasPermission } from '../config/permissions.js';
import { invitePath, checkInvitePassword } from '../utils/invite.js';
import { escapeRegex } from '../utils/connectLogic.js';
import * as connect from './connect.service.js';
import * as taskService from './task.service.js';
import * as goalService from './goal.service.js';
import * as journalService from './journal.service.js';
import { CalendarService } from './calendar.service.js';
import { getInvite } from './meetingInvite.service.js';

/**
 * Sharing LifeOS items (tasks, goals, events, meetings, notes) inside Connect chats.
 *
 * LifeOS data belongs to a workspace, and friends may be in different workspaces. So a share sends a small SNAPSHOT
 * (a copy of the key fields at that moment), never live access. The receiver can read it, and for tasks, goals, events
 * and notes copy it into their own workspace ("Add to my ..."). Meetings carry the existing invitation link instead.
 */

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const PERM = { task: 'tasks', goal: 'goals', event: 'schedule', meeting: 'meetings', note: 'journal' };
const PAGE = { task: '/tasks', goal: '/goals', event: '/calendar', note: '/journal' };
const clip = (v, n) => (v == null ? undefined : String(v).slice(0, n));

/** My active workspace and what I may do in it. */
async function workspaceOf(me) {
  const u = await User.findById(me).select('activeTenantId name').lean();
  const m = u?.activeTenantId && await Membership.findOne({ tenantId: u.activeTenantId, userId: oid(me), status: 'active' }).lean();
  if (!m) throw new ApiError(403, 'Open one of your workspaces first, then try again.', { code: 'NO_WORKSPACE' });
  const can = (perm) => hasPermission(m.permissions || [], perm);
  return { tenantId: String(u.activeTenantId), can, userName: u.name, asUser: { id: String(me), tenantId: String(u.activeTenantId), permissions: m.permissions } };
}
const need = (ws, type, action) => {
  if (!ws.can(`${PERM[type]}.${action}`)) throw ApiError.forbidden(`You do not have permission to ${action} ${type === 'event' ? 'calendar events' : `${type}s`} in this workspace.`);
};

const fmtDate = (d) => (d ? new Date(d).toISOString() : undefined);

// ── what I can pick from ────────────────────────────────────────────────
export async function shareOptions(me, type, q) {
  if (!PERM[type]) throw ApiError.badRequest('Unknown item type.');
  const ws = await workspaceOf(me);
  need(ws, type, 'view');
  const t = { tenantId: oid(ws.tenantId) };
  const rx = q ? { $regex: escapeRegex(String(q).slice(0, 60)), $options: 'i' } : null;
  let items = [];
  if (type === 'task') {
    const rows = await Task.find({ ...t, ...(rx ? { title: rx } : {}), status: { $nin: ['completed', 'cancelled'] } }).sort({ updatedAt: -1 }).limit(30).select('title priority dueDate').lean();
    items = rows.map((r) => ({ id: String(r._id), title: r.title, subtitle: [r.priority, r.dueDate && `due ${r.dueDate.toISOString().slice(0, 10)}`].filter(Boolean).join(' · ') }));
  } else if (type === 'goal') {
    const rows = await Goal.find({ ...t, ...(rx ? { title: rx } : {}), status: 'active' }).sort({ updatedAt: -1 }).limit(30).select('title progress targetDate').lean();
    items = rows.map((r) => ({ id: String(r._id), title: r.title, subtitle: `${r.progress || 0}% done${r.targetDate ? ` · target ${r.targetDate.toISOString().slice(0, 10)}` : ''}` }));
  } else if (type === 'event') {
    const rows = await CalendarEvent.find({ ...t, ...(rx ? { title: rx } : {}), startAt: { $gte: new Date(Date.now() - 86400000) } }).sort({ startAt: 1 }).limit(30).select('title startAt').lean();
    items = rows.map((r) => ({ id: String(r._id), title: r.title, subtitle: r.startAt.toISOString().slice(0, 16).replace('T', ' ') }));
  } else if (type === 'meeting') {
    const rows = await Meeting.find({ ...t, ...(rx ? { title: rx } : {}), status: { $in: ['scheduled', 'live'] }, $or: [{ organizerId: oid(me) }, { 'participants.userId': oid(me) }] }).sort({ startAt: 1 }).limit(30).select('title startAt status organizerId').lean();
    items = rows.map((r) => ({ id: String(r._id), title: r.title, subtitle: `${r.status === 'live' ? 'Live now' : r.startAt.toISOString().slice(0, 16).replace('T', ' ')}`, organizer: String(r.organizerId) === String(me) }));
  } else {
    const rows = await DailyNote.find({ ...t, authorId: oid(me), type: 'journal', ...(rx ? { $or: [{ title: rx }, { content: rx }] } : {}) }).sort({ entryDate: -1 }).limit(30).select('title content entryDate').lean();
    items = rows.map((r) => ({ id: String(r._id), title: r.title || clip(r.content, 60) || 'Untitled entry', subtitle: r.entryDate.toISOString().slice(0, 10) }));
  }
  return { items };
}

// ── building the snapshot ───────────────────────────────────────────────
async function snapshotOf(me, ws, type, id, { password, includePassword }) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Item not found.');
  need(ws, type, 'view');
  const base = { tenantId: oid(ws.tenantId), _id: oid(id) };
  if (type === 'task') {
    const r = await Task.findOne(base).lean();
    if (!r) throw ApiError.notFound('Item not found.');
    return { refId: r._id, title: clip(r.title, 200), subtitle: [r.priority, r.dueDate && `due ${r.dueDate.toISOString().slice(0, 10)}`].filter(Boolean).join(' · '),
      data: { priority: r.priority, status: r.status, category: clip(r.category, 60), dueDate: fmtDate(r.dueDate), estimatedMinutes: r.estimatedMinutes, description: clip(r.description, 1000), subtasks: (r.subtasks || []).slice(0, 20).map((s) => ({ title: clip(s.title, 120), isDone: Boolean(s.isDone) })) } };
  }
  if (type === 'goal') {
    const r = await Goal.findOne(base).lean();
    if (!r) throw ApiError.notFound('Item not found.');
    return { refId: r._id, title: clip(r.title, 200), subtitle: `${r.progress || 0}% done`,
      data: { type: r.type, status: r.status, progress: r.progress || 0, targetDate: fmtDate(r.targetDate), description: clip(r.description, 1000), milestones: (r.milestones || []).slice(0, 20).map((m) => ({ title: clip(m.title, 120), isDone: Boolean(m.isDone), dueDate: fmtDate(m.dueDate) })) } };
  }
  if (type === 'event') {
    const r = await CalendarEvent.findOne(base).lean();
    if (!r) throw ApiError.notFound('Item not found.');
    return { refId: r._id, title: clip(r.title, 200), subtitle: r.startAt.toISOString().slice(0, 16).replace('T', ' '),
      data: { type: r.type, allDay: Boolean(r.allDay), startAt: fmtDate(r.startAt), endAt: fmtDate(r.endAt), description: clip(r.description, 1000) } };
  }
  if (type === 'note') {
    const r = await DailyNote.findOne({ ...base, authorId: oid(me) }).lean(); // only my own journal entries
    if (!r) throw ApiError.notFound('Item not found.');
    return { refId: r._id, title: clip(r.title || r.content, 80) || 'Journal entry', subtitle: r.entryDate.toISOString().slice(0, 10),
      data: { entryDate: fmtDate(r.entryDate), mood: r.mood, tags: (r.tags || []).slice(0, 10).map((x) => clip(x, 30)), content: clip(r.content, 3000) } };
  }
  // meeting: carries the invitation link so anyone with a LifeOS account can open it
  const r = await Meeting.findOne({ ...base, $or: [{ organizerId: oid(me) }, { 'participants.userId': oid(me) }] }).select('+invite.passwordHash').lean();
  if (!r) throw ApiError.notFound('Item not found.');
  const isOrganizer = String(r.organizerId) === String(me);
  let link;
  let pw;
  if (isOrganizer && r.invite?.enabled !== false) {
    const invite = await getInvite(ws.asUser, id); // creates the link if the meeting has none
    link = invite.path;
    if (includePassword) {
      if (password) {
        if (!(await checkInvitePassword(password, r.invite?.passwordHash))) throw ApiError.badRequest('That is not the meeting password.', { code: 'WRONG_PASSWORD' });
        pw = clip(password, 64);
      } else if (invite.password) {
        pw = invite.password; // a brand-new link: its first password
      } else {
        throw ApiError.badRequest('Type the meeting password to include it, or untick that option.', { code: 'PASSWORD_REQUIRED' });
      }
    }
  } else if (r.invite?.enabled !== false && r.invite?.createdAt) {
    link = invitePath(r._id, r.invite.version || 1);
  }
  return { refId: r._id, title: clip(r.title, 200), subtitle: r.status === 'live' ? 'Live now' : r.startAt.toISOString().slice(0, 16).replace('T', ' '),
    data: { status: r.status, startAt: fmtDate(r.startAt), endAt: fmtDate(r.endAt), timezone: r.timezone, link, password: pw, location: undefined } };
}

export async function shareResource(me, conversationId, { type, id, password, includePassword, replyToId }) {
  if (!PERM[type]) throw ApiError.badRequest('Unknown item type.');
  const ws = await workspaceOf(me);
  const snap = await snapshotOf(me, ws, type, id, { password, includePassword });
  return connect.sendResource(me, conversationId, { type, tenantId: oid(ws.tenantId), ...snap }, replyToId);
}

// ── receiving ───────────────────────────────────────────────────────────
async function meetingPathFor(me, m) {
  const ok = await Meeting.exists({ _id: m.resource.refId, tenantId: m.resource.tenantId, $or: [{ organizerId: oid(me) }, { 'participants.userId': oid(me) }] });
  if (ok) return `/meetings/${m.resource.refId}`;
  return m.resource.data?.link || null;
}

function view(m, me, extra) {
  const r = m.resource;
  const mine = String(m.senderId) === String(me);
  const data = { ...r.data };
  return { messageId: String(m._id), type: r.type, title: r.title, subtitle: r.subtitle, data, mine, ...extra };
}

export async function getResource(me, messageId) {
  const m = await connect.loadResourceMessage(me, messageId);
  const r = m.resource;
  const mine = String(m.senderId) === String(me);
  const addedEntry = (r.added || []).find((a) => String(a.userId) === String(me));
  const sender = await User.findById(m.senderId).select('name').lean();
  let canAdd = false;
  let reason = null;
  if (!mine && r.type !== 'meeting') {
    try { const ws = await workspaceOf(me); need(ws, r.type, 'create'); canAdd = true; } catch (err) { reason = err.message; }
  }
  const open = r.type === 'meeting' ? await meetingPathFor(me, m) : mine ? PAGE[r.type] : null;
  return view(m, me, {
    senderName: sender?.name || 'Someone', canAdd, reason, open,
    added: addedEntry ? { path: PAGE[r.type] } : null,
  });
}

export async function addResource(me, messageId) {
  const m = await connect.loadResourceMessage(me, messageId);
  const r = m.resource;
  if (r.type === 'meeting') throw ApiError.badRequest('Meetings are opened with their link.');
  if (String(m.senderId) === String(me)) throw ApiError.badRequest('This item is already yours.');
  if ((r.added || []).some((a) => String(a.userId) === String(me))) throw new ApiError(409, 'You already added this.', { code: 'ALREADY_ADDED' });
  const ws = await workspaceOf(me);
  need(ws, r.type, 'create');
  const sender = await User.findById(m.senderId).select('name').lean();
  const from = `Shared by ${sender?.name || 'a friend'} in LifeOS Connect`;
  const d = r.data || {};
  let created;
  if (r.type === 'task') {
    created = await taskService.create(ws.asUser, {
      title: r.title, description: d.description, priority: d.priority || 'medium', category: d.category, estimatedMinutes: d.estimatedMinutes,
      ...(d.dueDate ? { dueDate: new Date(d.dueDate) } : {}), notes: from,
      subtasks: (d.subtasks || []).map((s) => ({ title: s.title, isDone: false })),
    });
  } else if (r.type === 'goal') {
    created = await goalService.create(ws.asUser, {
      title: r.title, description: [d.description, from].filter(Boolean).join('\n\n'), type: d.type || 'short_term',
      ...(d.targetDate ? { targetDate: new Date(d.targetDate) } : {}),
      milestones: (d.milestones || []).map((x) => ({ title: x.title, isDone: false, ...(x.dueDate ? { dueDate: new Date(x.dueDate) } : {}) })),
    });
  } else if (r.type === 'event') {
    created = await CalendarService.create(ws.asUser, { title: r.title, type: d.type || 'other', description: [d.description, from].filter(Boolean).join('\n\n'), allDay: d.allDay, startAt: d.startAt, endAt: d.endAt });
  } else {
    created = await journalService.create(ws.asUser, { type: 'journal', title: r.title, content: `${d.content || ''}\n\n— ${from}`.trim(), entryDate: new Date(), mood: d.mood, tags: d.tags || [], isPrivate: true });
  }
  await ConnectMessage.updateOne({ _id: m._id }, { $push: { 'resource.added': { userId: oid(me), refId: created._id || created.id } } });
  return { created: { type: r.type, id: String(created._id || created.id), path: PAGE[r.type] } };
}
