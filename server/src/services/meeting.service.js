import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Meeting, TranscriptSegment, ActionItem, CalendarEvent, Membership, User, Task } from '../models/index.js';
import { env } from '../config/env.js';
import * as storage from './storage.service.js';
import * as stt from './stt.service.js';
import * as ai from './ai.service.js';
import { enqueue } from './job.service.js';
import * as taskService from './task.service.js';
import { buildExport, isExportAllowed } from './meetingExport.service.js';
import { askAboutMeeting } from './meetingAsk.service.js';
import { renderMinutes } from './meetingPipeline.service.js';
import { hashToken, generateToken } from '../utils/token.js';
import { expandRecurrence } from '../utils/recurrence.js';
import { ApiError } from '../utils/ApiError.js';
import * as notificationService from './notification.service.js';
import { AuditService } from './audit.service.js';

/**
 * Meetings service.
 *
 * Two layers of access control:
 *  1. Tenant boundary — every query is scoped by tenantId (enforced by requireTenant).
 *  2. Meeting boundary — inside a workspace, a member sees a meeting only if they are
 *     the organizer or a listed participant (workspace owners see all workspace meetings).
 *     Callers without access get 404 (never 403) so meeting ids can't be probed.
 * Only the organizer (or workspace owner) may change or run a meeting.
 */

const MAX_PAGE_SIZE = 50;
const TASK_STATUS = { pending: 'not_started', in_progress: 'in_progress', completed: 'completed', cancelled: 'cancelled' };

// ── helpers ─────────────────────────────────────────────────────────────

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isWorkspaceOwner(user) {
  return user.tenantRole === 'owner';
}

function accessFilter(user) {
  if (isWorkspaceOwner(user)) return { tenantId: user.tenantId };
  return {
    tenantId: user.tenantId,
    $or: [{ organizerId: user.id }, { 'participants.userId': user.id }],
  };
}

function canManage(user, meeting) {
  return isWorkspaceOwner(user) || String(meeting.organizerId) === String(user.id);
}

function toClient(doc) {
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return { ...o, id: String(o._id) };
}

async function loadForUser(user, id) {
  const meeting = await Meeting.findOne({ _id: id, ...accessFilter(user) });
  if (!meeting) throw ApiError.notFound('Meeting not found');
  return meeting;
}

async function loadForManage(user, id) {
  const meeting = await loadForUser(user, id);
  if (!canManage(user, meeting)) {
    throw ApiError.forbidden('Only the meeting organizer can do this');
  }
  return meeting;
}

/**
 * Participants may only reference ACTIVE members of this workspace via userId.
 * A foreign userId would otherwise grant a stranger access to the meeting.
 */
async function resolveParticipants(user, participants = [], organizerId = user.id) {
  const seen = new Set();
  const cleaned = [];
  for (const p of participants) {
    const key = p.userId ? `u:${p.userId}` : `n:${(p.email || p.name).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push({ ...p });
  }

  const ids = cleaned.filter((p) => p.userId).map((p) => p.userId);
  if (ids.length) {
    const active = await Membership.find({
      tenantId: user.tenantId,
      userId: { $in: ids },
      status: 'active',
    })
      .select('userId')
      .lean();
    const ok = new Set(active.map((m) => String(m.userId)));
    const bad = ids.filter((id) => !ok.has(String(id)));
    if (bad.length) {
      throw ApiError.badRequest('Some participants are not members of this workspace', {
        code: 'VALIDATION_ERROR',
        errors: bad.map((id) => ({ field: 'participants.userId', message: `Not a member: ${id}` })),
      });
    }
  }

  // The ORGANIZER (not whoever is editing) is always the chair of the meeting.
  if (!cleaned.some((p) => p.userId && String(p.userId) === String(organizerId))) {
    if (String(organizerId) === String(user.id)) {
      cleaned.unshift({ userId: user.id, name: user.name, email: user.email, role: 'chair' });
    } else {
      const org = await User.findById(organizerId).select('name email').lean();
      if (org) cleaned.unshift({ userId: org._id, name: org.name, email: org.email, role: 'chair' });
    }
  }
  return cleaned;
}

function memberRecipients(meeting, actorId) {
  return [...new Set(meeting.participants.filter((p) => p.userId).map((p) => String(p.userId)))].filter(
    (id) => id !== String(actorId)
  );
}

function notifyParticipants(meeting, actorId, title, message) {
  for (const userId of memberRecipients(meeting, actorId)) {
    notificationService.notify({
      tenantId: meeting.tenantId,
      userId,
      type: 'meeting',
      module: 'meeting',
      title,
      message,
      relatedId: meeting._id,
      priority: 'normal',
    });
  }
}

async function createCalendarEvent(meeting) {
  const event = await CalendarEvent.create({
    tenantId: meeting.tenantId,
    userId: meeting.organizerId,
    title: meeting.title,
    type: 'meeting',
    description: meeting.description,
    allDay: false,
    startAt: meeting.startAt,
    endAt: meeting.endAt,
    meetingId: meeting._id,
  });
  return event._id;
}

/** Keeps the linked calendar event in sync; recreates it if the user deleted it from the calendar. */
async function syncCalendarEvent(meeting) {
  if (meeting.calendarEventId) {
    const res = await CalendarEvent.updateOne(
      { _id: meeting.calendarEventId, tenantId: meeting.tenantId },
      {
        $set: {
          title: meeting.title,
          description: meeting.description,
          startAt: meeting.startAt,
          endAt: meeting.endAt,
        },
      }
    );
    if (res.matchedCount > 0) return;
  }
  meeting.calendarEventId = await createCalendarEvent(meeting);
  await meeting.save();
}

async function removeCalendarEvent(meeting) {
  if (!meeting.calendarEventId) return;
  await CalendarEvent.deleteOne({ _id: meeting.calendarEventId, tenantId: meeting.tenantId });
}

function audit(user, action, meeting, details = {}) {
  AuditService.log({
    tenantId: user.tenantId,
    userId: user.id,
    action,
    resource: 'meeting',
    resourceId: meeting._id,
    details: { title: meeting.title, ...details },
  });
}

// ── meetings ────────────────────────────────────────────────────────────

export async function list(user, query) {
  const { status, type, scope = 'all', from, to, search, compact } = query;
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const maxLimit = compact ? 300 : MAX_PAGE_SIZE;
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit || '20', 10)));
  const now = new Date();

  const and = [accessFilter(user)];
  let sort = { startAt: -1 };

  if (status) and.push({ status });
  if (type) and.push({ type });
  if (scope === 'upcoming') {
    // A live meeting stays "upcoming/current" even when it runs past its scheduled end.
    and.push({ $or: [{ status: 'live' }, { status: 'scheduled', endAt: { $gte: now } }] });
    sort = { startAt: 1 };
  } else if (scope === 'past') {
    and.push({ status: { $ne: 'live' }, $or: [{ status: { $in: ['completed', 'cancelled'] } }, { endAt: { $lt: now } }] });
  }
  if (from || to) {
    const range = {};
    if (from) range.$gte = new Date(`${from}T00:00:00.000Z`);
    if (to) range.$lte = new Date(`${to}T23:59:59.999Z`);
    and.push({ startAt: range });
  }

  // Archive search: title, description, agenda, participants, transcript, summary, minutes, action items.
  const hits = { transcript: new Set(), actionItem: new Set() };
  if (search) {
    const q = search.slice(0, 100);
    const rx = new RegExp(escapeRegex(q), 'i');
    const accessible = await Meeting.find(accessFilter(user)).select('_id').limit(2000).lean();
    const ids = accessible.map((m) => m._id);

    let segHits = [];
    try {
      segHits = await TranscriptSegment.find({ tenantId: user.tenantId, meetingId: { $in: ids }, $text: { $search: q } })
        .select('meetingId')
        .limit(500)
        .lean();
    } catch {
      segHits = [];
    }
    if (!segHits.length) {
      segHits = await TranscriptSegment.find({ tenantId: user.tenantId, meetingId: { $in: ids }, text: rx }).select('meetingId').limit(500).lean();
    }
    segHits.forEach((h) => hits.transcript.add(String(h.meetingId)));
    const aiHits = await ActionItem.find({ tenantId: user.tenantId, meetingId: { $in: ids }, $or: [{ task: rx }, { assigneeName: rx }] })
      .select('meetingId')
      .limit(500)
      .lean();
    aiHits.forEach((h) => hits.actionItem.add(String(h.meetingId)));

    and.push({
      $or: [
        { title: rx },
        { description: rx },
        { agenda: rx },
        { notes: rx },
        { 'participants.name': rx },
        { 'summary.executiveSummary': rx },
        { 'summary.keyPoints': rx },
        { 'summary.decisions': rx },
        { 'minutes.content': rx },
        { _id: { $in: [...hits.transcript, ...hits.actionItem] } },
      ],
    });
  }

  const filter = { $and: and };
  const select = compact
    ? 'title type status startAt endAt participants.name location recording.status processing seriesId'
    : '-summary.keyPoints -summary.decisions -summary.questions -summary.nextSteps -summary.topics -minutes.content -notes';
  const [items, total] = await Promise.all([
    Meeting.find(filter).select(select).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    Meeting.countDocuments(filter),
  ]);

  return {
    items: items.map((m) => {
      const o = toClient(m);
      const id = String(m._id);
      if (search) {
        o.matchedIn = [hits.transcript.has(id) && 'transcript', hits.actionItem.has(id) && 'action item'].filter(Boolean);
      }
      o.hasTranscript = ['done'].includes(m.processing?.transcript) || undefined;
      o.hasSummary = Boolean(m.summary?.executiveSummary) || m.processing?.summary === 'done' || undefined;
      o.hasMinutes = m.processing?.minutes === 'done' || undefined;
      return o;
    }),
    total,
    page,
    limit,
  };
}

export async function get(user, id) {
  const meeting = await loadForUser(user, id);
  const [segmentCount, actionItemCount, seenDoc] = await Promise.all([
    TranscriptSegment.countDocuments({ tenantId: user.tenantId, meetingId: meeting._id }),
    ActionItem.countDocuments({ tenantId: user.tenantId, meetingId: meeting._id }),
    Meeting.findById(meeting._id).select('recording.seen').lean(),
  ]);
  const seen = seenDoc?.recording?.seen || [];
  const out = { ...toClient(meeting), stats: { segmentCount, actionItemCount }, canManage: canManage(user, meeting) };
  out.recording = { ...(out.recording || {}), nextChunkIndex: seen.length ? Math.max(...seen) + 1 : 0 };
  return out;
}

export async function create(user, body) {
  const startAt = new Date(body.startAt);
  const endAt = new Date(body.endAt);
  if (endAt <= startAt) throw ApiError.badRequest('endAt must be after startAt');

  const participants = await resolveParticipants(user, body.participants);
  const recurrence = body.recurrence && body.recurrence.frequency !== 'none' ? body.recurrence : undefined;
  const occurrences = expandRecurrence({ startAt, endAt, timezone: body.timezone || 'UTC', recurrence });
  const seriesId = occurrences.length > 1 ? new mongoose.Types.ObjectId() : undefined;

  const docs = occurrences.map((o) => ({
    tenantId: user.tenantId,
    organizerId: user.id,
    title: body.title,
    description: body.description,
    type: body.type,
    agenda: body.agenda,
    location: body.location,
    timezone: body.timezone,
    startAt: o.startAt,
    endAt: o.endAt,
    recurrence: body.recurrence,
    reminders: body.reminders,
    participants,
    seriesId,
  }));

  const meetings = await Meeting.insertMany(docs);
  try {
    const events = await CalendarEvent.insertMany(
      meetings.map((m) => ({
        tenantId: m.tenantId,
        userId: m.organizerId,
        title: m.title,
        type: 'meeting',
        description: m.description,
        allDay: false,
        startAt: m.startAt,
        endAt: m.endAt,
        meetingId: m._id,
      }))
    );
    await Meeting.bulkWrite(
      meetings.map((m, i) => ({ updateOne: { filter: { _id: m._id }, update: { $set: { calendarEventId: events[i]._id } } } }))
    );
    meetings.forEach((m, i) => { m.calendarEventId = events[i]._id; });
  } catch (err) {
    // Never leave meetings that silently miss the calendar.
    await Meeting.deleteMany({ _id: { $in: meetings.map((m) => m._id) } });
    await CalendarEvent.deleteMany({ meetingId: { $in: meetings.map((m) => m._id) } });
    throw err;
  }

  const first = meetings[0];
  notifyParticipants(first, user.id, 'Meeting scheduled', occurrences.length > 1
    ? `"${first.title}" has been scheduled (${occurrences.length} occurrences).`
    : `"${first.title}" has been scheduled.`);
  return { ...toClient(first), occurrences: occurrences.length };
}

export async function update(user, id, patch) {
  const meeting = await loadForManage(user, id);

  const { notes, ...rest } = patch;
  const touchesDetails = Object.keys(rest).length > 0;
  if (touchesDetails && meeting.status !== 'scheduled') {
    throw ApiError.conflict(`A ${meeting.status} meeting can no longer be edited (notes excepted)`);
  }

  const timeChanged =
    (rest.startAt && new Date(rest.startAt).getTime() !== meeting.startAt.getTime()) ||
    (rest.endAt && new Date(rest.endAt).getTime() !== meeting.endAt.getTime());

  if (rest.participants) rest.participants = await resolveParticipants(user, rest.participants, meeting.organizerId);
  if (rest.startAt) rest.startAt = new Date(rest.startAt);
  if (rest.endAt) rest.endAt = new Date(rest.endAt);

  // organizerId / tenantId / status / recording / processing are never client-settable.
  meeting.set({ ...rest, ...(notes !== undefined ? { notes } : {}) });
  if (meeting.endAt <= meeting.startAt) throw ApiError.badRequest('endAt must be after startAt');
  await meeting.save();

  if (touchesDetails) await syncCalendarEvent(meeting);
  if (timeChanged) {
    notifyParticipants(meeting, user.id, 'Meeting rescheduled', `"${meeting.title}" has a new time.`);
  }
  return toClient(meeting);
}

export async function remove(user, id, { scope = 'one' } = {}) {
  const meeting = await loadForManage(user, id);
  if (meeting.status === 'live') throw ApiError.conflict('End the meeting before deleting it');

  const targets = [meeting];
  if (scope === 'series' && meeting.seriesId) {
    const future = await Meeting.find({
      tenantId: user.tenantId,
      seriesId: meeting.seriesId,
      _id: { $ne: meeting._id },
      status: 'scheduled',
      startAt: { $gte: meeting.startAt },
    });
    targets.push(...future);
  }
  for (const m of targets) {
    await Promise.all([
      TranscriptSegment.deleteMany({ tenantId: user.tenantId, meetingId: m._id }),
      ActionItem.deleteMany({ tenantId: user.tenantId, meetingId: m._id }),
      removeCalendarEvent(m),
      storage.deletePrefix(storage.keys.prefix(user.tenantId, m._id)).catch((e) => console.error(`[meetings] storage cleanup failed: ${e.message}`)),
    ]);
    await Meeting.deleteOne({ _id: m._id, tenantId: user.tenantId });
  }
  audit(user, 'meeting.delete', meeting, { count: targets.length });
  return { success: true, deleted: targets.length };
}

export async function start(user, id) {
  const meeting = await loadForManage(user, id);
  if (meeting.status === 'live') return toClient(meeting); // idempotent
  if (meeting.status !== 'scheduled') {
    throw ApiError.conflict(`A ${meeting.status} meeting cannot be started`);
  }
  meeting.status = 'live';
  meeting.startedAt = new Date();
  await meeting.save();
  audit(user, 'meeting.start', meeting);
  notifyParticipants(meeting, user.id, 'Meeting started', `"${meeting.title}" is now live.`);
  return toClient(meeting);
}

export async function end(user, id, body = {}) {
  const meeting = await loadForManage(user, id);
  if (meeting.status === 'completed') return toClient(meeting); // idempotent
  if (meeting.status !== 'live') throw ApiError.conflict('Only a live meeting can be ended');

  meeting.status = 'completed';
  meeting.endedAt = new Date();
  meeting.durationSec = Math.max(0, Math.round((meeting.endedAt - meeting.startedAt) / 1000));
  if (body.durationSec) meeting.durationSec = Math.min(body.durationSec, meeting.durationSec + 60);
  await meeting.save();
  audit(user, 'meeting.end', meeting, { durationSec: meeting.durationSec });

  // Background processing. The recording is saved first and never depends on AI succeeding.
  const hasAudio = meeting.recording?.status && meeting.recording.status !== 'none';
  if (hasAudio) {
    await enqueue('finalize_recording', {
      tenantId: meeting.tenantId,
      meetingId: meeting._id,
      payload: { totalChunks: body.totalChunks, durationSec: meeting.durationSec },
    });
  } else if (ai.aiConfigured() && (await TranscriptSegment.countDocuments({ meetingId: meeting._id })) > 0) {
    await Meeting.updateOne({ _id: meeting._id }, { $set: { 'processing.summary': 'pending', 'processing.actionItems': 'pending' } });
    await enqueue('analyze', { tenantId: meeting.tenantId, meetingId: meeting._id });
  }
  return toClient(await Meeting.findById(meeting._id));
}

export async function cancel(user, id) {
  const meeting = await loadForManage(user, id);
  if (meeting.status === 'cancelled') return toClient(meeting); // idempotent
  if (meeting.status !== 'scheduled') {
    throw ApiError.conflict(`A ${meeting.status} meeting cannot be cancelled`);
  }
  meeting.status = 'cancelled';
  await removeCalendarEvent(meeting);
  meeting.calendarEventId = undefined;
  await meeting.save();
  audit(user, 'meeting.cancel', meeting);
  notifyParticipants(meeting, user.id, 'Meeting cancelled', `"${meeting.title}" was cancelled.`);
  return toClient(meeting);
}

// ── transcript ──────────────────────────────────────────────────────────

export async function listTranscript(user, id, query) {
  const meeting = await loadForUser(user, id);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit || '200', 10)));
  const filter = { tenantId: user.tenantId, meetingId: meeting._id };
  if (query.afterSeq !== undefined) filter.seq = { $gt: parseInt(query.afterSeq, 10) };
  if (query.q) filter.text = new RegExp(escapeRegex(query.q.slice(0, 100)), 'i');

  const rows = await TranscriptSegment.find(filter)
    .sort({ seq: 1 })
    .limit(limit + 1)
    .lean();
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((r) => ({ ...r, id: String(r._id) }));
  return { items, hasMore, nextAfterSeq: items.length ? items[items.length - 1].seq : null };
}

export async function appendTranscript(user, id, segments) {
  const meeting = await loadForManage(user, id);
  if (!['live', 'completed'].includes(meeting.status)) {
    throw ApiError.conflict('Transcript can only be added to a live or completed meeting');
  }
  const ops = segments.map((s) => ({
    updateOne: {
      filter: { meetingId: meeting._id, seq: s.seq },
      update: {
        $set: {
          tenantId: meeting.tenantId,
          meetingId: meeting._id,
          seq: s.seq,
          speakerLabel: s.speakerLabel || 'Speaker 1',
          speakerName: s.speakerName,
          text: s.text,
          startMs: s.startMs,
          endMs: s.endMs,
          confidence: s.confidence,
          source: s.source || 'live',
        },
      },
      upsert: true,
    },
  }));
  const res = await TranscriptSegment.bulkWrite(ops, { ordered: false });
  return { received: segments.length, inserted: res.upsertedCount, updated: res.modifiedCount };
}

export async function editSegment(user, id, seq, patch) {
  const meeting = await loadForManage(user, id);
  const set = { edited: true };
  if (patch.text !== undefined) set.text = patch.text;
  if (patch.speakerName !== undefined) set.speakerName = patch.speakerName;
  const seg = await TranscriptSegment.findOneAndUpdate(
    { tenantId: user.tenantId, meetingId: meeting._id, seq },
    { $set: set },
    { new: true, runValidators: true }
  ).lean();
  if (!seg) throw ApiError.notFound('Transcript segment not found');
  return { ...seg, id: String(seg._id) };
}

// ── action items ────────────────────────────────────────────────────────

async function resolveAssignee(user, body) {
  const out = { assigneeName: body.assigneeName, assigneeUserId: undefined };
  if (!body.assigneeUserId) return out;
  const membership = await Membership.findOne({
    tenantId: user.tenantId,
    userId: body.assigneeUserId,
    status: 'active',
  })
    .select('userId')
    .lean();
  if (!membership) throw ApiError.badRequest('Assignee is not a member of this workspace');
  out.assigneeUserId = body.assigneeUserId;
  if (!out.assigneeName) {
    const u = await User.findById(body.assigneeUserId).select('name').lean();
    out.assigneeName = u?.name;
  }
  return out;
}

export async function listActionItems(user, id) {
  const meeting = await loadForUser(user, id);
  const items = await ActionItem.find({ tenantId: user.tenantId, meetingId: meeting._id })
    .sort({ createdAt: 1 })
    .lean();
  return { items: items.map((i) => ({ ...i, id: String(i._id) })) };
}

export async function createActionItem(user, id, body) {
  const meeting = await loadForManage(user, id);
  const assignee = await resolveAssignee(user, body);
  const item = await ActionItem.create({
    tenantId: user.tenantId,
    meetingId: meeting._id,
    createdBy: user.id,
    task: body.task,
    ...assignee,
    deadline: body.deadline ? new Date(body.deadline) : undefined,
    priority: body.priority,
    status: body.status,
    source: 'manual',
  });
  return { ...item.toObject(), id: String(item._id) };
}

export async function updateActionItem(user, id, itemId, patch) {
  const meeting = await loadForManage(user, id);
  const data = { ...patch };
  if (patch.assigneeUserId !== undefined || patch.assigneeName !== undefined) {
    Object.assign(data, await resolveAssignee(user, patch));
  }
  if (data.deadline !== undefined) data.deadline = data.deadline ? new Date(data.deadline) : null;
  const item = await ActionItem.findOneAndUpdate(
    { _id: itemId, tenantId: user.tenantId, meetingId: meeting._id },
    { $set: data },
    { new: true, runValidators: true }
  ).lean();
  if (!item) throw ApiError.notFound('Action item not found');
  if (item.taskId && (patch.status || patch.deadline !== undefined || patch.priority)) {
    const set = {};
    if (patch.status) set.status = TASK_STATUS[patch.status];
    if (patch.status) set.completedAt = patch.status === 'completed' ? new Date() : null;
    if (patch.deadline !== undefined) set.dueDate = item.deadline || null;
    if (patch.priority) set.priority = patch.priority;
    await Task.updateOne({ _id: item.taskId, tenantId: user.tenantId }, { $set: set });
  }
  return { ...item, id: String(item._id) };
}

export async function removeActionItem(user, id, itemId) {
  const meeting = await loadForManage(user, id);
  const res = await ActionItem.deleteOne({ _id: itemId, tenantId: user.tenantId, meetingId: meeting._id });
  if (res.deletedCount === 0) throw ApiError.notFound('Action item not found');
  return { success: true };
}

// ── capabilities (booleans only — never secrets) ────────────────────────

export function capabilities() {
  return {
    storage: storage.storageConfigured(),
    speechToText: stt.sttConfigured(),
    liveTranscription: stt.sttConfigured() && env.stt.live,
    ai: ai.aiConfigured(),
    maxChunkBytes: env.meetings.chunkMaxBytes,
    maxRecordingBytes: env.meetings.maxRecordingBytes,
  };
}

export async function listMembers(user) {
  const memberships = await Membership.find({ tenantId: user.tenantId, status: 'active' }).select('userId').lean();
  const users = await User.find({ _id: { $in: memberships.map((m) => m.userId) } }).select('name').lean();
  // Name + id only: enough to pick participants, no contact details exposed.
  return users.map((u) => ({ id: String(u._id), name: u.name })).sort((a, b) => a.name.localeCompare(b.name));
}

// ── recording (chunked, idempotent) ─────────────────────────────────────

const AUDIO_TYPE = /^(audio\/(webm|mp4|ogg|mpeg|wav|x-m4a|aac)|video\/(webm|mp4)|application\/octet-stream)/i;

export async function uploadChunk(user, id, index, buffer, contentType = '') {
  if (!storage.storageConfigured()) {
    throw new ApiError(503, 'Recording storage is not configured on the server', { code: 'STORAGE_NOT_CONFIGURED' });
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw ApiError.badRequest('Empty audio chunk');
  if (buffer.length > env.meetings.chunkMaxBytes) throw new ApiError(413, 'Audio chunk too large', { code: 'CHUNK_TOO_LARGE' });
  if (!AUDIO_TYPE.test(contentType)) throw new ApiError(415, 'Unsupported audio type', { code: 'UNSUPPORTED_MEDIA_TYPE' });
  if (!Number.isInteger(index) || index < 0 || index >= env.meetings.maxChunks) throw ApiError.badRequest('Invalid chunk index');

  const meeting = await loadForManage(user, id);
  if (!['live', 'completed'].includes(meeting.status)) throw ApiError.conflict('Meeting is not recording');
  if (meeting.recording.status === 'ready') throw ApiError.conflict('This recording has already been finalised');
  if ((meeting.recording.sizeBytes || 0) + buffer.length > env.meetings.maxRecordingBytes) {
    throw new ApiError(413, 'Recording size limit reached', { code: 'RECORDING_TOO_LARGE' });
  }

  // 1) write the bytes, 2) only then record that the chunk exists.
  await storage.putObject(storage.keys.chunk(user.tenantId, meeting._id, index), buffer, contentType.split(';')[0]);
  const mime = contentType.split(';')[0].toLowerCase();
  const res = await Meeting.updateOne(
    { _id: meeting._id, tenantId: user.tenantId, 'recording.seen': { $ne: index } },
    {
      $addToSet: { 'recording.seen': index },
      $inc: { 'recording.sizeBytes': buffer.length },
      $set: { 'recording.status': 'recording', 'recording.mimeType': mime === 'application/octet-stream' ? 'audio/webm' : mime },
    }
  );
  return { index, stored: true, duplicate: res.modifiedCount === 0 };
}

/** Live near-real-time transcription of one short, self-contained audio clip. */
export async function transcribeChunk(user, id, buffer, contentType, offsetMs) {
  const meeting = await loadForManage(user, id);
  if (meeting.status !== 'live') throw ApiError.conflict('Meeting is not live');
  if (!stt.sttConfigured() || !env.stt.live) {
    throw new ApiError(503, 'Live transcription is not available', { code: 'STT_NOT_CONFIGURED' });
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw ApiError.badRequest('Empty audio clip');
  if (buffer.length > env.meetings.chunkMaxBytes) throw new ApiError(413, 'Audio clip too large', { code: 'CHUNK_TOO_LARGE' });
  if (!AUDIO_TYPE.test(contentType)) throw new ApiError(415, 'Unsupported audio type', { code: 'UNSUPPORTED_MEDIA_TYPE' });

  let found;
  try {
    found = await stt.transcribeBuffer(buffer, contentType, { offsetMs, diarize: false });
  } catch (err) {
    // A failed live clip must never affect the recording; report and let the client carry on.
    throw new ApiError(502, 'Live transcription is temporarily unavailable', { code: 'STT_FAILED' });
  }
  if (!found.length) return { segments: [] };

  const updated = await Meeting.findOneAndUpdate({ _id: meeting._id }, { $inc: { transcriptSeq: found.length } }, { new: true }).select('transcriptSeq');
  const base = updated.transcriptSeq - found.length;
  const docs = found.map((s, i) => ({ ...s, seq: base + i, source: 'live' }));
  await TranscriptSegment.bulkWrite(
    docs.map((s) => ({
      updateOne: {
        filter: { meetingId: meeting._id, seq: s.seq },
        update: { $set: { ...s, tenantId: meeting.tenantId, meetingId: meeting._id } },
        upsert: true,
      },
    })),
    { ordered: false }
  );
  return { segments: docs };
}

/** Manual / imported transcript (also the fallback when speech-to-text isn't configured). */
export async function importTranscriptText(user, id, text) {
  const meeting = await loadForManage(user, id);
  if (!['live', 'completed'].includes(meeting.status)) throw ApiError.conflict('Start the meeting before adding a transcript');
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 5000);
  if (!lines.length) throw ApiError.badRequest('Nothing to import');
  const parsed = lines.map((line) => {
    const m = /^([^:]{1,40}):\s+(.+)$/.exec(line);
    return { speakerLabel: m ? m[1].trim() : 'Speaker', text: (m ? m[2] : line).slice(0, 5000) };
  });
  const updated = await Meeting.findOneAndUpdate({ _id: meeting._id }, { $inc: { transcriptSeq: parsed.length } }, { new: true }).select('transcriptSeq');
  const base = updated.transcriptSeq - parsed.length;
  await TranscriptSegment.insertMany(
    parsed.map((p, i) => ({ ...p, tenantId: meeting.tenantId, meetingId: meeting._id, seq: base + i, startMs: (base + i) * 1000, source: 'manual' })),
    { ordered: false }
  );
  await Meeting.updateOne({ _id: meeting._id }, { $set: { 'processing.transcript': 'done' } });
  return { imported: parsed.length };
}

export async function getRecordingUrl(user, id, apiBase) {
  const meeting = await loadForUser(user, id);
  const r = meeting.recording || {};
  if (r.status !== 'ready' || !r.storageKey) {
    throw ApiError.conflict(r.status === 'failed' ? 'Recording processing failed' : 'Recording is not ready yet', { code: 'RECORDING_NOT_READY' });
  }
  const { url, expiresAt } = await storage.getSignedReadUrl(r.storageKey, { meetingId: meeting._id, ttlSec: 3600, apiBase });
  return { url, expiresAt, mimeType: r.mimeType || 'audio/webm', durationSec: r.durationSec || meeting.durationSec, sizeBytes: r.sizeBytes };
}

/** Token-authorised stream (local dev driver only; s3 playback goes straight to the bucket). */
export async function openRecordingStream(id, token, range) {
  const key = storage.verifyStreamToken(token, id);
  const meeting = await Meeting.findById(id).select('recording.mimeType').lean();
  const obj = await storage.getObject(key, range);
  return { ...obj, mimeType: meeting?.recording?.mimeType || 'audio/webm' };
}

// ── processing control ──────────────────────────────────────────────────

export async function retry(user, id, stage) {
  const meeting = await loadForManage(user, id);
  if (meeting.status !== 'completed') throw ApiError.conflict('Processing is available after the meeting has ended');
  const base = { tenantId: meeting.tenantId, meetingId: meeting._id };
  const segCount = await TranscriptSegment.countDocuments({ meetingId: meeting._id });
  const mustAi = () => {
    if (!ai.aiConfigured()) throw new ApiError(503, 'AI provider is not configured on the server', { code: 'AI_NOT_CONFIGURED' });
  };

  if (stage === 'finalize') {
    if (!['failed', 'uploading', 'recording'].includes(meeting.recording.status)) throw ApiError.conflict('Recording does not need finalising');
    await Meeting.updateOne({ _id: meeting._id }, { $set: { 'recording.status': 'uploading' } });
    await enqueue('finalize_recording', { ...base, payload: { durationSec: meeting.durationSec } });
  } else if (stage === 'transcribe') {
    if (!stt.sttConfigured()) throw new ApiError(503, 'Speech-to-text is not configured on the server', { code: 'STT_NOT_CONFIGURED' });
    if (meeting.recording.status !== 'ready') throw ApiError.conflict('There is no finished recording to transcribe');
    await Meeting.updateOne({ _id: meeting._id }, { $set: { 'processing.transcript': 'pending' } });
    await enqueue('transcribe', base);
  } else if (stage === 'analyze' || stage === 'summary') {
    mustAi();
    if (!segCount) throw ApiError.conflict('There is no transcript to summarise yet');
    await Meeting.updateOne({ _id: meeting._id }, { $set: { 'processing.summary': 'pending', 'processing.actionItems': 'pending' } });
    await enqueue('analyze', base);
  } else if (stage === 'minutes') {
    mustAi();
    const withNotes = await Meeting.findById(meeting._id).select('+analysis.notes').lean();
    if (withNotes.analysis?.notes) {
      await Meeting.updateOne({ _id: meeting._id }, { $set: { 'processing.minutes': 'pending' } });
      await enqueue('minutes', base);
    } else {
      if (!segCount) throw ApiError.conflict('There is no transcript to build minutes from yet');
      await Meeting.updateOne({ _id: meeting._id }, { $set: { 'processing.summary': 'pending', 'processing.actionItems': 'pending', 'processing.minutes': 'pending' } });
      await enqueue('analyze', base); // analysis queues the minutes job when it finishes
    }
  } else {
    throw ApiError.badRequest('Unknown processing stage');
  }
  const fresh = await Meeting.findById(meeting._id).select('processing recording.status').lean();
  return { processing: fresh.processing, recording: { status: fresh.recording?.status } };
}

export async function getSummary(user, id) {
  const meeting = await loadForUser(user, id);
  return { summary: meeting.summary || null, processing: meeting.processing };
}

export async function getMinutes(user, id) {
  const meeting = await loadForUser(user, id);
  return { minutes: meeting.minutes || null, processing: meeting.processing };
}

export async function saveMinutes(user, id, content) {
  const meeting = await loadForManage(user, id);
  meeting.set('minutes.content', content);
  meeting.set('minutes.editedAt', new Date());
  await meeting.save();
  return { minutes: meeting.minutes };
}

// ── speakers ────────────────────────────────────────────────────────────

export async function listSpeakers(user, id) {
  const meeting = await loadForUser(user, id);
  const rows = await TranscriptSegment.aggregate([
    { $match: { tenantId: meeting.tenantId, meetingId: meeting._id } },
    { $group: { _id: '$speakerLabel', name: { $max: '$speakerName' }, segments: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return { items: rows.map((r) => ({ label: r._id, name: r.name || null, segments: r.segments })) };
}

export async function renameSpeaker(user, id, { label, name }) {
  const meeting = await loadForManage(user, id);
  const update = name ? { $set: { speakerName: name.trim() } } : { $unset: { speakerName: 1 } };
  const res = await TranscriptSegment.updateMany({ tenantId: user.tenantId, meetingId: meeting._id, speakerLabel: label }, update);
  return { updated: res.modifiedCount };
}

// ── sharing (explicit, expiring, read-only, never audio) ────────────────

export async function createShare(user, id, { expiresInDays = 7, includeTranscript = false } = {}) {
  const meeting = await loadForManage(user, id);
  if (meeting.status !== 'completed') throw ApiError.conflict('Only completed meetings can be shared');
  const token = generateToken(24);
  const expiresAt = new Date(Date.now() + expiresInDays * 86400000);
  await Meeting.updateOne(
    { _id: meeting._id, tenantId: user.tenantId },
    { $set: { share: { tokenHash: hashToken(token), expiresAt, includeTranscript, createdAt: new Date() } } }
  );
  audit(user, 'meeting.share', meeting, { expiresAt, includeTranscript });
  return { token, expiresAt, includeTranscript };
}

export async function getShare(user, id) {
  const meeting = await loadForUser(user, id);
  const sh = meeting.share;
  const active = Boolean(sh?.expiresAt && sh.expiresAt > new Date());
  return { active, expiresAt: active ? sh.expiresAt : null, includeTranscript: active ? sh.includeTranscript : false };
}

export async function revokeShare(user, id) {
  const meeting = await loadForManage(user, id);
  await Meeting.updateOne({ _id: meeting._id, tenantId: user.tenantId }, { $unset: { share: 1 } });
  audit(user, 'meeting.unshare', meeting);
  return { success: true };
}

export async function getSharedMeeting(token) {
  const meeting = await Meeting.findOne({ 'share.tokenHash': hashToken(String(token)), 'share.expiresAt': { $gt: new Date() } });
  if (!meeting) throw ApiError.notFound('This link is invalid or has expired');
  const [items, segments] = await Promise.all([
    ActionItem.find({ meetingId: meeting._id }).sort({ createdAt: 1 }).select('task assigneeName deadline deadlineText priority status').lean(),
    meeting.share.includeTranscript
      ? TranscriptSegment.find({ meetingId: meeting._id }).sort({ seq: 1 }).limit(6000).select('seq speakerLabel speakerName text startMs').lean()
      : [],
  ]);
  return {
    title: meeting.title,
    startAt: meeting.startedAt || meeting.startAt,
    endAt: meeting.endedAt || meeting.endAt,
    timezone: meeting.timezone,
    location: meeting.location,
    participants: meeting.participants.map((p) => p.name),
    summary: meeting.summary || null,
    minutes: meeting.minutes?.content || null,
    actionItems: items,
    transcript: segments,
    expiresAt: meeting.share.expiresAt,
  };
}

// ── action items ↔ LifeOS Tasks ─────────────────────────────────────────

async function pushToTask(user, meeting, item) {
  if (item.taskId) return item;
  const when = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: meeting.timezone || 'UTC' }).format(meeting.startedAt || meeting.startAt);
  const task = await taskService.create(user, {
    title: item.task,
    description: [`From meeting: ${meeting.title} (${when})`, item.assigneeName ? `Assigned to: ${item.assigneeName}` : null, item.deadlineText && !item.deadline ? `Deadline mentioned: ${item.deadlineText}` : null]
      .filter(Boolean)
      .join('\n'),
    priority: item.priority,
    status: TASK_STATUS[item.status],
    dueDate: item.deadline || undefined,
    category: 'meeting',
  });
  item.taskId = task._id;
  await item.save();
  return item;
}

export async function createTaskFromActionItem(user, id, itemId) {
  const meeting = await loadForManage(user, id);
  const item = await ActionItem.findOne({ _id: itemId, tenantId: user.tenantId, meetingId: meeting._id });
  if (!item) throw ApiError.notFound('Action item not found');
  await pushToTask(user, meeting, item);
  return { ...item.toObject(), id: String(item._id) };
}

export async function createTasksFromActionItems(user, id) {
  const meeting = await loadForManage(user, id);
  const items = await ActionItem.find({
    tenantId: user.tenantId,
    meetingId: meeting._id,
    taskId: { $exists: false },
    status: { $in: ['pending', 'in_progress'] },
  });
  for (const item of items) await pushToTask(user, meeting, item);
  return { created: items.length };
}

export async function listAllActionItems(user, query) {
  const accessible = await Meeting.find(accessFilter(user)).select('title startAt').limit(1000).lean();
  const titles = new Map(accessible.map((m) => [String(m._id), m]));
  const filter = { tenantId: user.tenantId, meetingId: { $in: accessible.map((m) => m._id) } };
  if (query.status) filter.status = query.status;
  if (query.mine === 'true') filter.assigneeUserId = user.id;
  const items = await ActionItem.find(filter).sort({ status: 1, deadline: 1, createdAt: -1 }).limit(300).lean();
  return {
    items: items.map((i) => ({ ...i, id: String(i._id), meetingTitle: titles.get(String(i.meetingId))?.title, meetingDate: titles.get(String(i.meetingId))?.startAt })),
  };
}

// ── export & ask ────────────────────────────────────────────────────────

export async function exportMeeting(user, id, kind, format) {
  if (!isExportAllowed(kind, format)) throw ApiError.badRequest(`Cannot export ${kind} as ${format}`);
  const meeting = await loadForUser(user, id);
  const [segments, actionItems] = await Promise.all([
    kind === 'transcript' ? TranscriptSegment.find({ meetingId: meeting._id }).sort({ seq: 1 }).select('seq speakerLabel speakerName text startMs').lean() : [],
    kind === 'action-items' ? ActionItem.find({ meetingId: meeting._id }).sort({ createdAt: 1 }).lean() : [],
  ]);
  return buildExport(kind, format, { meeting, segments, actionItems });
}

export async function ask(user, id, { question, history }) {
  if (!ai.aiConfigured()) throw new ApiError(503, 'AI provider is not configured on the server', { code: 'AI_NOT_CONFIGURED' });
  const meeting = await loadForUser(user, id);
  const hasTranscript = (await TranscriptSegment.countDocuments({ meetingId: meeting._id })) > 0;
  if (!hasTranscript && !meeting.summary?.executiveSummary) {
    return { answer: "There isn't a transcript for this meeting yet, so I have nothing to answer from.", citations: [], mode: 'none' };
  }
  return askAboutMeeting({ meeting, question, history });
}

// Re-exported for the minutes editor "reset to generated" convenience.
export { renderMinutes };
