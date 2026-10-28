import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import * as appModels from '../models/index.js';
import { hasPermission } from '../config/permissions.js';
import { LifeArea, BalanceLog, KnowledgeEntry, BackupMeta } from '../models/life.model.js';
import { RadarSource, RadarProfile } from '../models/radar.model.js';
import { checkFeedUrl, normalizeKeywords } from '../utils/radar.logic.js';
import * as L from '../utils/life.logic.js';

// Task, Goal and CalendarEvent come from the app's own models. If one is not exported there, that part is simply skipped.
const { Task, Goal, CalendarEvent } = appModels;
const scope = (u) => ({ tenantId: u.tenantId, userId: u.id });
const ID_RE = /^[0-9a-fA-F]{24}$/;
const needId = (v, what) => { if (!ID_RE.test(String(v))) throw ApiError.notFound(`${what} not found.`); return String(v); };
const strip = (d) => { const { tenantId, userId, search, __v, ...rest } = d; return rest; };

// ───────────────────────────── Life Balance ─────────────────────────────
const cleanCats = (list) => [...new Set((list || []).map((c) => String(c).trim()).filter(Boolean))].slice(0, 10);

export async function listAreas(u) {
  return (await LifeArea.find(scope(u)).sort({ createdAt: 1 }).lean()).map(strip);
}
export async function addArea(u, body) {
  if ((await LifeArea.countDocuments(scope(u))) >= L.LIMITS.areas) throw ApiError.badRequest(`You can have up to ${L.LIMITS.areas} areas.`);
  const name = body.name.trim();
  if (await LifeArea.exists({ ...scope(u), name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })) throw ApiError.conflict('You already have an area with that name.');
  return strip((await LifeArea.create({ ...scope(u), name, targetMinutes: body.targetMinutes || 0, taskCategories: cleanCats(body.taskCategories), eventTypes: body.eventTypes || [] })).toObject());
}
export async function updateArea(u, id, patch) {
  needId(id, 'Area');
  const set = {};
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.targetMinutes !== undefined) set.targetMinutes = patch.targetMinutes;
  if (patch.taskCategories !== undefined) set.taskCategories = cleanCats(patch.taskCategories);
  if (patch.eventTypes !== undefined) set.eventTypes = patch.eventTypes;
  const a = await LifeArea.findOneAndUpdate({ _id: id, ...scope(u) }, { $set: set }, { new: true }).lean();
  if (!a) throw ApiError.notFound('Area not found.');
  return strip(a);
}
export async function removeArea(u, id) {
  needId(id, 'Area');
  const a = await LifeArea.findOneAndDelete({ _id: id, ...scope(u) });
  if (!a) throw ApiError.notFound('Area not found.');
  const r = await BalanceLog.deleteMany({ areaId: a._id, ...scope(u) });
  return { removed: true, logsRemoved: r.deletedCount || 0 };
}
export async function addLog(u, body, now = new Date()) {
  needId(body.areaId, 'Area');
  if (!L.dateAllowed(body.date, now)) throw ApiError.badRequest('Choose a date from the last year up to tomorrow.');
  if (!(await LifeArea.exists({ _id: body.areaId, ...scope(u) }))) throw ApiError.notFound('Area not found.');
  const today = await BalanceLog.countDocuments({ ...scope(u), createdAt: { $gte: new Date(now.getTime() - 86400000) } });
  if (today >= L.LIMITS.logsPerDay) throw ApiError.badRequest('That is a lot of entries for one day. Try again tomorrow.');
  const log = await BalanceLog.create({ ...scope(u), areaId: body.areaId, date: body.date, minutes: body.minutes, note: body.note || '' });
  return strip(log.toObject());
}
export async function removeLog(u, id) {
  needId(id, 'Entry');
  const r = await BalanceLog.deleteOne({ _id: id, ...scope(u) });
  if (!r.deletedCount) throw ApiError.notFound('Entry not found.');
  return { removed: true };
}
/** Finished tasks and ended calendar events between two dates, as time logs for the areas that asked for them. */
async function automatic(u, areas, fromStr, toStr, now) {
  const needTasks = Task && areas.some((a) => a.taskCategories?.length);
  const needEvents = CalendarEvent && areas.some((a) => a.eventTypes?.length);
  const from = new Date(`${fromStr}T00:00:00Z`);
  const to = new Date(`${toStr}T00:00:00Z`);
  const [tasks, events] = await Promise.all([
    needTasks ? Task.find({ tenantId: u.tenantId, createdBy: u.id, status: 'completed', completedAt: { $gte: from, $lt: to }, category: { $exists: true, $ne: '' } }).select('status category completedAt actualMinutes estimatedMinutes').limit(5000).lean() : [],
    needEvents ? CalendarEvent.find({ tenantId: u.tenantId, userId: u.id, allDay: { $ne: true }, startAt: { $gte: from, $lt: to }, endAt: { $lte: now } }).select('type allDay startAt endAt').limit(5000).lean() : [],
  ]);
  return L.autoLogs(areas, tasks, events, now);
}

/** week = any date in the wanted week (default: this week). */
export async function balance(u, week, now = new Date()) {
  const day = week && L.isDateStr(week) ? week : L.todayStr(now);
  const ws = L.weekStart(day);
  const we = L.addDays(ws, 6);
  const areas = await LifeArea.find(scope(u)).sort({ createdAt: 1 }).lean();
  const from = L.addDays(ws, -7 * 8);
  const logs = await BalanceLog.find({ ...scope(u), date: { $gte: from, $lte: we } }).sort({ date: -1, createdAt: -1 }).lean();
  const auto = await automatic(u, areas, from, L.addDays(we, 1), now);
  const manualTotals = L.totalsByWeek(logs);
  const autoTotals = L.totalsByWeek(auto.logs);
  const totals = L.mergeTotals(manualTotals, autoTotals);
  const byId = new Map(areas.map((a) => [String(a._id), a]));
  const view = L.weekView(areas, totals, ws, autoTotals).map((v) => ({ ...v, previousAverage: L.previousAverage(v.areaId, totals, ws), taskCategories: byId.get(v.areaId)?.taskCategories || [], eventTypes: byId.get(v.areaId)?.eventTypes || [] }));
  const thisWeek = logs.filter((l) => l.date >= ws && l.date <= we).map((l) => ({ _id: l._id, areaId: l.areaId, date: l.date, minutes: l.minutes, note: l.note }));
  // finished tasks of this week that matched an area but had no minutes recorded: say so instead of guessing
  const weekAuto = await automatic(u, areas, ws, L.addDays(we, 1), now);
  return {
    weekStart: ws, weekEnd: we, areas: view, entries: thisWeek, notes: L.gentleNotes(areas, totals, ws), hasAreas: areas.length > 0,
    tasksWithoutMinutes: weekAuto.noTime, eventTypes: L.EVENT_TYPES,
    autoAvailable: { tasks: !!Task, events: !!CalendarEvent },
  };
}

// ───────────────────────────── Knowledge ─────────────────────────────
function prepEntry(body) {
  let url = '';
  try { url = L.cleanUrl(body.url); } catch (e) { throw ApiError.badRequest(e.message); }
  if (body.kind === 'link' && !url) throw ApiError.badRequest('A link needs a web address.');
  const e = { kind: body.kind, title: body.title.trim(), body: body.body || '', url, tags: L.cleanTags(body.tags), pinned: !!body.pinned };
  return { ...e, search: L.searchText(e) };
}
export async function listEntries(u, { q, tag, kind, pinned } = {}) {
  const filter = { ...scope(u) };
  const terms = L.queryTerms(q);
  if (terms.length) filter.$and = L.termsToRegex(terms).map((re) => ({ search: re }));
  if (tag) filter.tags = String(tag).toLowerCase().slice(0, 30);
  if (L.KINDS.includes(kind)) filter.kind = kind;
  if (pinned === 'true') filter.pinned = true;
  const rows = await KnowledgeEntry.find(filter).sort({ pinned: -1, updatedAt: -1 }).limit(200).lean();
  const tagRows = await KnowledgeEntry.aggregate([{ $match: scope(u) }, { $unwind: '$tags' }, { $group: { _id: '$tags', n: { $sum: 1 } } }, { $sort: { n: -1, _id: 1 } }, { $limit: 40 }]);
  const total = await KnowledgeEntry.countDocuments(scope(u));
  return { entries: rows.map(strip), tags: tagRows.map((t) => ({ tag: t._id, count: t.n })), total, max: L.LIMITS.entries };
}
export async function addEntry(u, body) {
  if ((await KnowledgeEntry.countDocuments(scope(u))) >= L.LIMITS.entries) throw ApiError.badRequest(`You can keep up to ${L.LIMITS.entries} entries. Delete some first, or make a backup and tidy up.`);
  return strip((await KnowledgeEntry.create({ ...scope(u), ...prepEntry(body) })).toObject());
}
export async function updateEntry(u, id, patch) {
  needId(id, 'Entry');
  const cur = await KnowledgeEntry.findOne({ _id: id, ...scope(u) }).lean();
  if (!cur) throw ApiError.notFound('Entry not found.');
  const merged = { kind: cur.kind, title: cur.title, body: cur.body, url: cur.url, tags: cur.tags, pinned: cur.pinned, ...patch };
  const next = prepEntry(merged);
  const row = await KnowledgeEntry.findOneAndUpdate({ _id: id, ...scope(u) }, { $set: next }, { new: true }).lean();
  return strip(row);
}
export async function removeEntry(u, id) {
  needId(id, 'Entry');
  const r = await KnowledgeEntry.deleteOne({ _id: id, ...scope(u) });
  if (!r.deletedCount) throw ApiError.notFound('Entry not found.');
  return { removed: true };
}

// ───────────────────────────── Backup ─────────────────────────────
async function meta(u) {
  return (await BackupMeta.findOne(scope(u)).lean()) || { reminder: false, lastBackupAt: null };
}
export async function backupInfo(u) {
  const m = await meta(u);
  const [k, a, l] = await Promise.all([KnowledgeEntry.countDocuments(scope(u)), LifeArea.countDocuments(scope(u)), BalanceLog.countDocuments(scope(u))]);
  const days = m.lastBackupAt ? Math.floor((Date.now() - new Date(m.lastBackupAt).getTime()) / 86400000) : null;
  return { lastBackupAt: m.lastBackupAt || null, reminder: !!m.reminder, daysSince: days, due: !!m.reminder && (days === null || days >= 30), counts: { knowledge: k, areas: a, balanceLogs: l } };
}
export async function setBackupSettings(u, { reminder }) {
  await BackupMeta.findOneAndUpdate(scope(u), { $set: { reminder } }, { upsert: true, new: true });
  return backupInfo(u);
}
export async function exportBackup(u, now = new Date()) {
  const [entries, areas, logs, sources, profile, tasks, goals] = await Promise.all([
    KnowledgeEntry.find(scope(u)).sort({ createdAt: 1 }).lean(),
    LifeArea.find(scope(u)).sort({ createdAt: 1 }).lean(),
    BalanceLog.find(scope(u)).sort({ date: 1 }).lean(),
    RadarSource.find(scope(u)).lean(),
    RadarProfile.findOne(scope(u)).lean(),
    Task ? Task.find({ tenantId: u.tenantId, createdBy: u.id }).sort({ createdAt: 1 }).limit(L.LIMITS.tasksInBackup).lean() : [],
    Goal ? Goal.find({ tenantId: u.tenantId, createdBy: u.id }).sort({ createdAt: 1 }).limit(L.LIMITS.goalsInBackup).lean() : [],
  ]);
  const nameOf = new Map(areas.map((a) => [String(a._id), a.name]));
  const goalTitle = new Map(goals.map((g) => [String(g._id), g.title]));
  const iso = (d) => (d ? new Date(d).toISOString() : undefined);
  const drop = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const backup = L.buildBackup({
    knowledge: entries.map((e) => ({ kind: e.kind, title: e.title, body: e.body || '', url: e.url || '', tags: e.tags || [], pinned: !!e.pinned, createdAt: e.createdAt?.toISOString?.() })),
    areas: areas.map((a) => ({ name: a.name, targetMinutes: a.targetMinutes || 0, taskCategories: a.taskCategories || [], eventTypes: a.eventTypes || [] })),
    balanceLogs: logs.filter((l) => nameOf.has(String(l.areaId))).slice(0, L.LIMITS.logsInBackup).map((l) => ({ areaName: nameOf.get(String(l.areaId)), date: l.date, minutes: l.minutes, note: l.note || '' })),
    radarSources: sources.map((s) => ({ name: s.name, url: s.url, type: s.type })),
    radarKeywords: profile?.keywords || [],
    tasks: tasks.map((t) => drop({
      title: t.title, description: t.description, priority: t.priority, status: t.status, category: t.category, dueDate: iso(t.dueDate),
      estimatedMinutes: t.estimatedMinutes, actualMinutes: t.actualMinutes, recurrenceType: t.recurrenceType,
      subtasks: (t.subtasks || []).map((x) => ({ title: x.title || '', isDone: !!x.isDone })), notes: t.notes, completedAt: iso(t.completedAt),
      goalTitle: t.goalId ? goalTitle.get(String(t.goalId)) : undefined,
    })),
    goals: goals.map((g) => drop({
      title: g.title, description: g.description, type: g.type, targetDate: iso(g.targetDate), status: g.status, progress: g.progress,
      milestones: (g.milestones || []).map((m) => drop({ title: m.title, isDone: !!m.isDone, dueDate: iso(m.dueDate) })),
    })),
  }, now);
  await BackupMeta.findOneAndUpdate(scope(u), { $set: { lastBackupAt: now } }, { upsert: true, new: true });
  return backup;
}

async function existingFor(u) {
  const [entries, areas, sources, profile, tasks, goals] = await Promise.all([
    KnowledgeEntry.find(scope(u)).select('kind title body url').lean(),
    LifeArea.find(scope(u)).lean(),
    RadarSource.find(scope(u)).select('url').lean(),
    RadarProfile.findOne(scope(u)).lean(),
    Task ? Task.find({ tenantId: u.tenantId, createdBy: u.id }).select('title description dueDate').lean() : [],
    Goal ? Goal.find({ tenantId: u.tenantId, createdBy: u.id }).select('title type').lean() : [],
  ]);
  const logs = await BalanceLog.find(scope(u)).select('areaId date minutes note').lean();
  const nameOf = new Map(areas.map((a) => [String(a._id), a.name]));
  return {
    entrySigs: new Set(entries.map(L.entrySig)),
    areaNames: new Set(areas.map((a) => a.name.toLowerCase())),
    logSigs: new Set(logs.map((l) => L.logSig({ areaName: nameOf.get(String(l.areaId)), date: l.date, minutes: l.minutes, note: l.note }))),
    sourceUrls: new Set(sources.map((s) => s.url)),
    taskSigs: new Set(tasks.map(L.taskSig)),
    goalSigs: new Set(goals.map(L.goalSig)),
    keywords: profile?.keywords || [],
    entryCount: entries.length,
    areaCount: areas.length,
  };
}
const feedCleaner = (raw) => { const c = checkFeedUrl(raw); return c.ok ? c.url : ''; };

function readBackup(buf) {
  const r = L.parseBackup(buf);
  if (!r.ok) throw ApiError.badRequest(r.error);
  return r.backup;
}
export async function previewRestore(u, buf) {
  const b = readBackup(buf);
  const plan = L.planRestore(b.sections, await existingFor(u), { cleanFeedUrl: feedCleaner, canTasks: !!Task && hasPermission(u, 'tasks.create') });
  return { createdAt: b.createdAt, counts: L.planCounts(plan) };
}
export async function restore(u, buf, now = new Date()) {
  const b = readBackup(buf);
  const day = L.todayStr(now);
  const m = await meta(u);
  const used = m.restoreDay === day ? m.restoresToday || 0 : 0;
  if (used >= L.LIMITS.restoresPerDay) throw ApiError.badRequest('You restored several times today already. Try again tomorrow.');
  await BackupMeta.findOneAndUpdate(scope(u), { $set: { restoreDay: day, restoresToday: used + 1 } }, { upsert: true, new: true });

  const plan = L.planRestore(b.sections, await existingFor(u), { cleanFeedUrl: feedCleaner, canTasks: !!Task && hasPermission(u, 'tasks.create') });
  const s = scope(u);
  if (Goal && plan.goals.add.length) {
    await Goal.insertMany(plan.goals.add.map((g) => ({
      tenantId: u.tenantId, createdBy: u.id, title: g.title, description: g.description, type: g.type, status: g.status, progress: g.progress,
      targetDate: g.targetDate ? new Date(g.targetDate) : undefined,
      milestones: (g.milestones || []).map((m) => ({ title: m.title, isDone: m.isDone, dueDate: m.dueDate ? new Date(m.dueDate) : undefined })),
    })));
  }
  if (Task && plan.tasks.add.length) {
    const goalRows = Goal ? await Goal.find({ tenantId: u.tenantId, createdBy: u.id }).select('title').lean() : [];
    const goalId = new Map(goalRows.map((g) => [g.title.trim().toLowerCase(), g._id]));
    await Task.insertMany(plan.tasks.add.map((t) => ({
      tenantId: u.tenantId, createdBy: u.id, title: t.title, description: t.description, priority: t.priority, status: t.status, category: t.category,
      dueDate: t.dueDate ? new Date(t.dueDate) : undefined, estimatedMinutes: t.estimatedMinutes, actualMinutes: t.actualMinutes,
      recurrenceType: t.recurrenceType, subtasks: t.subtasks, notes: t.notes, completedAt: t.completedAt ? new Date(t.completedAt) : undefined,
      goalId: t.goalTitle ? goalId.get(t.goalTitle.trim().toLowerCase()) : undefined,
    })));
  }
  if (plan.areas.add.length) await LifeArea.insertMany(plan.areas.add.map((a) => ({ ...s, ...a })));
  if (plan.knowledge.add.length) await KnowledgeEntry.insertMany(plan.knowledge.add.map((e) => ({ ...s, ...e, search: L.searchText(e) })));
  if (plan.balanceLogs.add.length) {
    const areas = await LifeArea.find(s).lean();
    const idOf = new Map(areas.map((a) => [a.name.toLowerCase(), a._id]));
    const docs = plan.balanceLogs.add.map((l) => ({ ...s, areaId: idOf.get(l.areaName.toLowerCase()), date: l.date, minutes: l.minutes, note: l.note })).filter((d) => d.areaId);
    if (docs.length) await BalanceLog.insertMany(docs);
  }
  for (const src of plan.radarSources.add) {
    try { await RadarSource.create({ ...s, name: src.name.slice(0, 80), url: src.url, type: src.type }); } catch { /* already there: ignore */ }
  }
  if (plan.radarKeywords.add.length) {
    const kw = normalizeKeywords([...(await existingFor(u)).keywords, ...plan.radarKeywords.add]);
    await RadarProfile.findOneAndUpdate(s, { $set: { keywords: kw } }, { upsert: true, new: true });
  }
  return { restored: L.planCounts(plan) };
}
