import crypto from 'node:crypto';
import { z } from 'zod';

/** Life Balance, Knowledge and Backup: pure rules, no database. */

export const LIMITS = {
  entries: 2000, areas: 12, logsPerDay: 50, tags: 8, tagLen: 30, title: 160, body: 5000, url: 500, note: 200,
  maxMinutes: 1440, maxTarget: 10080, logsInBackup: 20000, restoreBytes: 5 * 1024 * 1024, restoresPerDay: 5, tasksInBackup: 5000, goalsInBackup: 500,
};
export const KINDS = ['note', 'link', 'lesson'];
/** Calendar event types an area can take time from. 'task' is left out on purpose: finished tasks are counted from the tasks themselves. */
export const EVENT_TYPES = ['work', 'school', 'meeting', 'study', 'exercise', 'personal', 'appointment', 'other'];
export const BACKUP_FORMAT = 1;

const clip = (s, n) => String(s ?? '').trim().slice(0, n);

// ─────────────────────────────── dates (all UTC, as YYYY-MM-DD text) ───────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isDateStr(s) {
  if (!DATE_RE.test(String(s))) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export const todayStr = (now = new Date()) => now.toISOString().slice(0, 10);
export function addDays(s, n) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Monday of the week that contains the date. */
export function weekStart(s) {
  const d = new Date(`${s}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
/** A log may be dated up to tomorrow (time zones) and up to about a year back. */
export function dateAllowed(s, now = new Date()) {
  if (!isDateStr(s)) return false;
  return s <= addDays(todayStr(now), 1) && s >= addDays(todayStr(now), -400);
}

// ─────────────────────────────── text helpers ───────────────────────────────
export function cleanTags(list) {
  const seen = new Set();
  const out = [];
  for (const t of Array.isArray(list) ? list : []) {
    const v = clip(t, LIMITS.tagLen).replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-');
    if (v.length >= 1 && !seen.has(v)) { seen.add(v); out.push(v); }
    if (out.length >= LIMITS.tags) break;
  }
  return out;
}
/** http(s) only, no username/password. Returns '' for empty, throws for bad. */
export function cleanUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (s.length > LIMITS.url) throw new Error('That web address is too long.');
  let u;
  try { u = new URL(s); } catch { throw new Error('That is not a valid web address.'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http and https links can be saved.');
  if (u.username || u.password) throw new Error('Links with a username or password are not allowed.');
  return u.toString();
}
export const searchText = (e) => `${e.title || ''} ${e.body || ''} ${(e.tags || []).join(' ')} ${e.url || ''}`.toLowerCase();
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Every word must appear somewhere (AND). Up to 5 words. Returns [] for an empty search. */
export function queryTerms(q) {
  return String(q ?? '').toLowerCase().split(/\s+/).map((t) => t.trim()).filter(Boolean).slice(0, 5).map((t) => t.slice(0, 40));
}
export const matchesTerms = (e, terms) => { const t = searchText(e); return terms.every((w) => t.includes(w)); };
export const termsToRegex = (terms) => terms.map((t) => new RegExp(escRe(t), 'i'));

// ─────────────────────────────── request schemas ───────────────────────────────
const idStr = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
export const areaSchema = z.object({
  name: z.string().trim().min(1).max(40),
  targetMinutes: z.number().int().min(0).max(LIMITS.maxTarget).optional().default(0),
  // Where this area also gets time from, automatically. Both are chosen by the person.
  taskCategories: z.array(z.string().trim().min(1).max(40)).max(10).optional().default([]),
  eventTypes: z.array(z.enum(EVENT_TYPES)).max(8).optional().default([]),
});
export const areaPatchSchema = areaSchema.partial().refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export const logSchema = z.object({
  areaId: idStr,
  minutes: z.number().int().min(1).max(LIMITS.maxMinutes),
  date: z.string().refine(isDateStr, 'Use a date like 2026-10-15'),
  note: z.string().trim().max(LIMITS.note).optional().default(''),
});
export const entrySchema = z.object({
  kind: z.enum(KINDS),
  title: z.string().trim().min(1).max(LIMITS.title),
  body: z.string().trim().max(LIMITS.body).optional().default(''),
  url: z.string().trim().max(LIMITS.url).optional().default(''),
  tags: z.array(z.string()).max(20).optional().default([]),
  pinned: z.boolean().optional().default(false),
});
export const entryPatchSchema = entrySchema.partial().refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export const settingsSchema = z.object({ reminder: z.boolean() });

// ─────────────────────────────── Life Balance maths ───────────────────────────────
/** logs: [{areaId, date, minutes}] already limited to the weeks wanted. Returns {weekKey: {areaId: minutes}}. */
export function totalsByWeek(logs) {
  const out = {};
  for (const l of logs) {
    const w = weekStart(l.date);
    out[w] ||= {};
    out[w][String(l.areaId)] = (out[w][String(l.areaId)] || 0) + l.minutes;
  }
  return out;
}
/** For one week: each area with minutes, target and percent of target (null when no target). autoTotals = the part that came from tasks and calendar. */
export function weekView(areas, totals, ws, autoTotals = {}) {
  const w = totals[ws] || {};
  const au = autoTotals[ws] || {};
  return areas.map((a) => {
    const minutes = w[String(a._id)] || 0;
    const auto = Math.min(minutes, au[String(a._id)] || 0);
    const target = a.targetMinutes || 0;
    return { areaId: String(a._id), name: a.name, minutes, auto, manual: minutes - auto, target, pct: target ? Math.round((minutes / target) * 100) : null };
  });
}
export const mergeTotals = (a, b) => {
  const out = JSON.parse(JSON.stringify(a));
  for (const [w, m] of Object.entries(b)) for (const [id, v] of Object.entries(m)) { out[w] ||= {}; out[w][id] = (out[w][id] || 0) + v; }
  return out;
};

/**
 * Time that already exists in tasks and the calendar, assigned to the areas the person mapped.
 * - finished tasks (status completed) with a category the area lists: actual minutes, else estimated, counted on the day they were completed
 * - calendar events of a type the area lists that have already ended (not all-day): their length, counted on the day they started
 * Each task or event goes to the FIRST matching area only, so nothing is counted twice.
 */
export function autoLogs(areas, tasks, events, now = new Date()) {
  const logs = [];
  const noTime = {};
  const cats = areas.map((a) => new Set((a.taskCategories || []).map((c) => String(c).trim().toLowerCase()).filter(Boolean)));
  const types = areas.map((a) => new Set(a.eventTypes || []));
  for (const t of tasks) {
    if (t.status !== 'completed' || !t.completedAt) continue;
    const cat = String(t.category || '').trim().toLowerCase();
    if (!cat) continue;
    const i = cats.findIndex((c) => c.has(cat));
    if (i < 0) continue;
    const id = String(areas[i]._id);
    const m = Math.round(Number(t.actualMinutes ?? t.estimatedMinutes ?? 0));
    if (!(m > 0)) { noTime[id] = (noTime[id] || 0) + 1; continue; }
    logs.push({ areaId: id, date: new Date(t.completedAt).toISOString().slice(0, 10), minutes: Math.min(m, LIMITS.maxMinutes), source: 'task' });
  }
  for (const e of events) {
    if (e.allDay || !e.endAt || !e.startAt) continue;
    if (new Date(e.endAt) > now) continue;
    const i = types.findIndex((s) => s.has(e.type));
    if (i < 0) continue;
    const m = Math.round((new Date(e.endAt) - new Date(e.startAt)) / 60000);
    if (!(m > 0)) continue;
    logs.push({ areaId: String(areas[i]._id), date: new Date(e.startAt).toISOString().slice(0, 10), minutes: Math.min(m, LIMITS.maxMinutes), source: 'event' });
  }
  return { logs, noTime };
}

/** Average minutes per week over the 4 full weeks before ws. */
export function previousAverage(areaId, totals, ws, weeks = 4) {
  let sum = 0;
  for (let i = 1; i <= weeks; i++) sum += totals[addDays(ws, -7 * i)]?.[String(areaId)] || 0;
  return Math.round(sum / weeks);
}
/** The first week in which the person logged anything at all (so empty weeks before they started do not count). */
export const firstWeekOf = (totals) => Object.keys(totals).sort()[0] || null;
/** How many weeks in a row, ending with the last full week, the area stayed below its own target. */
export function streakBelow(areaId, target, totals, ws, max = 8) {
  const first = firstWeekOf(totals);
  if (!target || !first) return 0;
  let n = 0;
  for (let i = 1; i <= max; i++) {
    const w = addDays(ws, -7 * i);
    if (w < first) break;
    if ((totals[w]?.[String(areaId)] || 0) < target) n++; else break;
  }
  return n;
}
/** Only say something when there is something true to say. Wording stays neutral. */
export function gentleNotes(areas, totals, ws) {
  const notes = [];
  for (const a of areas) {
    const s = streakBelow(a._id, a.targetMinutes, totals, ws);
    if (s >= 3) notes.push({ areaId: String(a._id), text: `${a.name} has been under your own target for ${s} weeks in a row. You may want to look at the target or at the plan.` });
  }
  return notes;
}

// ─────────────────────────────── backup ───────────────────────────────
const sha = (s, alg = 'sha256') => crypto.createHash(alg).update(s).digest('hex');
export const stable = (v) => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
};
export const sectionsChecksum = (sections) => sha(stable(sections));

export const entrySig = (e) => sha(`${e.kind}|${clip(e.title, 200).toLowerCase()}|${e.url || ''}|${clip(e.body, 6000)}`, 'sha1');
export const taskSig = (t) => sha(`${clip(t.title, 300).toLowerCase()}|${t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : ''}|${clip(t.description || '', 200)}`, 'sha1');
export const goalSig = (g) => `${clip(g.title, 300).toLowerCase()}|${g.type || ''}`;
export const logSig = (l) => `${String(l.areaName || '').toLowerCase()}|${l.date}|${l.minutes}|${l.note || ''}`;

const bEntry = z.object({
  kind: z.enum(KINDS), title: z.string().trim().min(1).max(LIMITS.title), body: z.string().max(LIMITS.body).optional().default(''),
  url: z.string().max(LIMITS.url).optional().default(''), tags: z.array(z.string()).max(20).optional().default([]), pinned: z.boolean().optional().default(false),
  createdAt: z.string().optional(),
});
const bArea = z.object({
  name: z.string().trim().min(1).max(40), targetMinutes: z.number().int().min(0).max(LIMITS.maxTarget).optional().default(0),
  taskCategories: z.array(z.string().trim().min(1).max(40)).max(10).optional().default([]), eventTypes: z.array(z.enum(EVENT_TYPES)).max(8).optional().default([]),
});
const isoDate = z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), 'bad date');
const bTask = z.object({
  title: z.string().trim().min(1).max(300), description: z.string().max(5000).optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).optional().default('medium'),
  status: z.enum(['not_started', 'in_progress', 'completed', 'cancelled', 'postponed']).optional().default('not_started'),
  category: z.string().trim().max(60).optional(), dueDate: isoDate.optional(),
  estimatedMinutes: z.number().int().min(0).max(100000).optional(), actualMinutes: z.number().int().min(0).max(100000).optional(),
  recurrenceType: z.enum(['none', 'daily', 'weekly', 'monthly']).optional().default('none'),
  subtasks: z.array(z.object({ title: z.string().trim().max(200).default(''), isDone: z.boolean().optional().default(false) })).max(50).optional().default([]),
  notes: z.string().max(5000).optional(), completedAt: isoDate.optional(), goalTitle: z.string().trim().max(300).optional(),
});
const bGoal = z.object({
  title: z.string().trim().min(1).max(300), description: z.string().max(5000).optional(),
  type: z.enum(['short_term', 'long_term']).optional().default('short_term'), targetDate: isoDate.optional(),
  status: z.enum(['active', 'completed', 'cancelled']).optional().default('active'), progress: z.number().min(0).max(100).optional().default(0),
  milestones: z.array(z.object({ title: z.string().trim().min(1).max(200), isDone: z.boolean().optional().default(false), dueDate: isoDate.optional() })).max(50).optional().default([]),
});
const bLog = z.object({ areaName: z.string().trim().min(1).max(40), date: z.string().refine(isDateStr), minutes: z.number().int().min(1).max(LIMITS.maxMinutes), note: z.string().max(LIMITS.note).optional().default('') });
const bSource = z.object({ name: z.string().trim().min(1).max(80), url: z.string().max(500), type: z.enum(['auto', 'job', 'scholarship', 'grant', 'other']).optional().default('auto') });
export const backupSchema = z.object({
  app: z.literal('LifeOS'),
  format: z.literal(BACKUP_FORMAT),
  createdAt: z.string(),
  checksum: z.string().length(64),
  sections: z.object({
    knowledge: z.array(bEntry).max(LIMITS.entries).default([]),
    areas: z.array(bArea).max(LIMITS.areas).default([]),
    balanceLogs: z.array(bLog).max(LIMITS.logsInBackup).default([]),
    radarSources: z.array(bSource).max(10).default([]),
    radarKeywords: z.array(z.string().max(40)).max(20).default([]),
    tasks: z.array(bTask).max(LIMITS.tasksInBackup).default([]),
    goals: z.array(bGoal).max(LIMITS.goalsInBackup).default([]),
  }),
});

export function buildBackup(sections, now = new Date()) {
  const clean = {
    knowledge: sections.knowledge || [], areas: sections.areas || [], balanceLogs: sections.balanceLogs || [],
    radarSources: sections.radarSources || [], radarKeywords: sections.radarKeywords || [],
    tasks: sections.tasks || [], goals: sections.goals || [],
  };
  return { app: 'LifeOS', format: BACKUP_FORMAT, createdAt: now.toISOString(), checksum: sectionsChecksum(clean), sections: clean };
}

/** Read an uploaded backup (Buffer or string). Never throws. */
export function parseBackup(input) {
  let obj;
  try {
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
    if (Buffer.byteLength(text) > LIMITS.restoreBytes) return { ok: false, error: 'That file is too large to be a LifeOS backup.' };
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not a readable LifeOS backup.' };
  }
  const r = backupSchema.safeParse(obj);
  if (!r.success) return { ok: false, error: 'That file is not a LifeOS backup, or it is from a newer version.' };
  if (sectionsChecksum(r.data.sections) !== r.data.checksum) {
    // zod fills defaults, so compare against the raw sections too
    if (sectionsChecksum(obj.sections) !== r.data.checksum) return { ok: false, error: 'The file looks damaged or was edited (checksum does not match). Nothing was restored.' };
  }
  return { ok: true, backup: r.data };
}

/**
 * Decide what a restore would add. Nothing is overwritten or deleted.
 * existing = { entrySigs:Set, areaNames:Set(lowercase), logSigs:Set, sourceUrls:Set, keywords:[], entryCount, areaCount }
 */
export function planRestore(sections, existing, { cleanFeedUrl = (u) => u, canTasks = true } = {}) {
  const plan = {
    tasks: { add: [], skip: 0, noPermission: 0 }, goals: { add: [], skip: 0 },
    knowledge: { add: [], skip: 0, overLimit: 0 }, areas: { add: [], skip: 0, overLimit: 0 }, balanceLogs: { add: [], skip: 0, noArea: 0 }, radarSources: { add: [], skip: 0, rejected: 0, overLimit: 0 }, radarKeywords: { add: [], skip: 0 } };
  const seenE = new Set(existing.entrySigs);
  let eCount = existing.entryCount;
  for (const e of sections.knowledge) {
    let url = '';
    try { url = cleanUrl(e.url); } catch { url = ''; }
    const item = { kind: e.kind, title: clip(e.title, LIMITS.title), body: clip(e.body, LIMITS.body), url, tags: cleanTags(e.tags), pinned: !!e.pinned };
    const sig = entrySig(item);
    if (seenE.has(sig)) { plan.knowledge.skip++; continue; }
    if (eCount >= LIMITS.entries) { plan.knowledge.overLimit++; continue; }
    seenE.add(sig); eCount++; plan.knowledge.add.push(item);
  }
  const names = new Set(existing.areaNames);
  let aCount = existing.areaCount;
  for (const a of sections.areas) {
    const key = a.name.toLowerCase();
    if (names.has(key)) { plan.areas.skip++; continue; }
    if (aCount >= LIMITS.areas) { plan.areas.overLimit++; continue; }
    names.add(key); aCount++; plan.areas.add.push({ name: a.name.trim(), targetMinutes: a.targetMinutes || 0, taskCategories: a.taskCategories || [], eventTypes: a.eventTypes || [] });
  }
  const seenL = new Set(existing.logSigs);
  for (const l of sections.balanceLogs) {
    if (!names.has(l.areaName.toLowerCase())) { plan.balanceLogs.noArea++; continue; }
    const sig = logSig(l);
    if (seenL.has(sig)) { plan.balanceLogs.skip++; continue; }
    seenL.add(sig); plan.balanceLogs.add.push({ areaName: l.areaName, date: l.date, minutes: l.minutes, note: l.note || '' });
  }
  const urls = new Set(existing.sourceUrls);
  let sCount = urls.size;
  for (const s of sections.radarSources) {
    const clean = cleanFeedUrl(s.url);
    if (!clean) { plan.radarSources.rejected++; continue; }
    if (urls.has(clean)) { plan.radarSources.skip++; continue; }
    if (sCount >= 10) { plan.radarSources.overLimit++; continue; }
    urls.add(clean); sCount++; plan.radarSources.add.push({ name: s.name.trim(), url: clean, type: s.type });
  }
  const seenT = new Set(existing.taskSigs || []);
  for (const t of sections.tasks || []) {
    const sig = taskSig(t);
    if (seenT.has(sig)) { plan.tasks.skip++; continue; }
    seenT.add(sig);
    if (!canTasks) { plan.tasks.noPermission++; continue; }
    plan.tasks.add.push(t);
  }
  const seenG = new Set(existing.goalSigs || []);
  for (const g of sections.goals || []) {
    const sig = goalSig(g);
    if (seenG.has(sig)) { plan.goals.skip++; continue; }
    seenG.add(sig); plan.goals.add.push(g);
  }
  const have = new Set(existing.keywords.map((k) => k.toLowerCase()));
  for (const k of sections.radarKeywords) {
    const v = clip(k, 40).toLowerCase();
    if (v.length < 2) continue;
    if (have.has(v)) { plan.radarKeywords.skip++; continue; }
    have.add(v); plan.radarKeywords.add.push(v);
  }
  return plan;
}
export const planCounts = (p) => ({
  knowledge: { add: p.knowledge.add.length, skip: p.knowledge.skip, overLimit: p.knowledge.overLimit },
  areas: { add: p.areas.add.length, skip: p.areas.skip, overLimit: p.areas.overLimit },
  balanceLogs: { add: p.balanceLogs.add.length, skip: p.balanceLogs.skip, noArea: p.balanceLogs.noArea },
  radarSources: { add: p.radarSources.add.length, skip: p.radarSources.skip, rejected: p.radarSources.rejected, overLimit: p.radarSources.overLimit },
  radarKeywords: { add: p.radarKeywords.add.length, skip: p.radarKeywords.skip },
  tasks: { add: p.tasks.add.length, skip: p.tasks.skip, noPermission: p.tasks.noPermission },
  goals: { add: p.goals.add.length, skip: p.goals.skip },
});
