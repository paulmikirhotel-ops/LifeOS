// Runs the real life.service.js against in-memory stand-ins for the models. Skipped if the stubs cannot be set up.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lifesvc-'));
const src = path.resolve(new URL('../src', import.meta.url).pathname);
const w = (rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
// copy the real logic and service, stub everything they import
for (const rel of ['utils/life.logic.js', 'services/life.service.js']) w(`src/${rel}`, fs.readFileSync(path.join(src, rel), 'utf8'));
fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
try { fs.symlinkSync('/opt/npm-tools/node_modules/zod', path.join(root, 'node_modules/zod')); } catch { /* ignore */ }

w('src/utils/ApiError.js', `export class ApiError extends Error { constructor(s,m){super(m);this.status=s;} static badRequest(m){return new ApiError(400,m);} static notFound(m){return new ApiError(404,m);} static conflict(m){return new ApiError(409,m);} static forbidden(m){return new ApiError(403,m);} }`);
w('src/config/permissions.js', `export const hasPermission = (u, p) => !(u.deny||[]).includes(p);`);
w('src/utils/radar.logic.js', `export const checkFeedUrl = (u) => (String(u).startsWith('https://') ? { ok: true, url: u } : { ok: false }); export const normalizeKeywords = (l) => [...new Set(l.map((x) => String(x).toLowerCase()))];`);
w('src/mini.js', `
let n = 1;
export function table() {
  const rows = [];
  const match = (r, q) => Object.entries(q || {}).every(([k, v]) => {
    if (k === '$and') return v.every((c) => match(r, c));
    if (v && typeof v === 'object' && !(v instanceof Date) && !(v instanceof RegExp) && !Array.isArray(v)) {
      return Object.entries(v).every(([op, x]) => {
        const a = r[k];
        if (op === '$gte') return a >= x;
        if (op === '$lte') return a <= x;
        if (op === '$lt') return a < x;
        if (op === '$ne') return a !== x;
        if (op === '$exists') return (a !== undefined) === x;
        return true;
      });
    }
    if (v instanceof RegExp) return v.test(r[k] ?? '');
    return String(r[k]) === String(v);
  });
  const chain = (list) => { const c = { sort: () => c, limit: () => c, select: () => c, lean: async () => list.map((x) => ({ ...x })), then: (res, rej) => c.lean().then(res, rej) }; return c; };
  const T = {
    rows,
    find: (q) => chain(rows.filter((r) => match(r, q))),
    findOne: (q) => { const r = rows.find((x) => match(x, q)); const c = chain(r ? [r] : []); c.lean = async () => (r ? { ...r } : null); return c; },
    countDocuments: async (q) => rows.filter((r) => match(r, q)).length,
    exists: async (q) => rows.some((r) => match(r, q)),
    create: async (d) => { const r = { _id: String(n++).padStart(24, '0'), createdAt: new Date(), ...d }; rows.push(r); return { ...r, toObject: () => ({ ...r }) }; },
    insertMany: async (ds) => ds.map((d) => { const r = { _id: String(n++).padStart(24, '0'), createdAt: new Date(), ...d }; rows.push(r); return r; }),
    findOneAndUpdate: (q, u) => { let r = rows.find((x) => match(x, q)); if (!r) { r = { _id: String(n++).padStart(24, '0'), ...q }; rows.push(r); } Object.assign(r, u.$set || {}); const c = chain([r]); c.lean = async () => ({ ...r }); c.then = (res, rej) => Promise.resolve({ ...r }).then(res, rej); return c; },
    findOneAndDelete: async (q) => { const i = rows.findIndex((x) => match(x, q)); return i < 0 ? null : rows.splice(i, 1)[0]; },
    deleteOne: async (q) => { const i = rows.findIndex((x) => match(x, q)); if (i >= 0) rows.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; },
    deleteMany: async (q) => { const k = rows.filter((x) => match(x, q)); for (const x of k) rows.splice(rows.indexOf(x), 1); return { deletedCount: k.length }; },
    aggregate: async () => [],
  };
  return T;
}`);
w('src/models/life.model.js', `import { table } from '../mini.js'; export const LifeArea = table(); export const BalanceLog = table(); export const KnowledgeEntry = table(); export const BackupMeta = table();`);
w('src/models/radar.model.js', `import { table } from '../mini.js'; export const RadarSource = table(); export const RadarProfile = table();`);
w('src/models/index.js', `import { table } from '../mini.js'; export const Task = table(); export const Goal = table(); export const CalendarEvent = table();`);
w('src/models/mongoose-stub.js', '');
w('node_modules/mongoose/package.json', '{"name":"mongoose","type":"module","main":"index.js"}');
w('node_modules/mongoose/index.js', 'export default {};');

let svc; let models; let L;
test('setup', async () => {
  svc = await import(pathToFileURL(path.join(root, 'src/services/life.service.js')).href);
  models = await import(pathToFileURL(path.join(root, 'src/models/index.js')).href);
  L = await import(pathToFileURL(path.join(root, 'src/utils/life.logic.js')).href);
  assert.ok(svc.balance);
});

const U = { id: 'u1'.padEnd(24, '0'), tenantId: 't1'.padEnd(24, '0') };
const NOW = new Date('2026-10-15T12:00:00Z');

test('balance counts finished tasks and ended events, and keeps the person\'s own logs separate', async () => {
  const work = await svc.addArea(U, { name: 'Work', targetMinutes: 600, taskCategories: ['Work'], eventTypes: ['meeting'] });
  await models.Task.create({ tenantId: U.tenantId, createdBy: U.id, status: 'completed', completedAt: new Date('2026-10-14T09:00:00Z'), category: 'work', actualMinutes: 90, title: 't' });
  await models.Task.create({ tenantId: U.tenantId, createdBy: 'someone-else', status: 'completed', completedAt: new Date('2026-10-14T09:00:00Z'), category: 'work', actualMinutes: 500, title: 'x' });
  await models.CalendarEvent.create({ tenantId: U.tenantId, userId: U.id, type: 'meeting', startAt: new Date('2026-10-13T10:00:00Z'), endAt: new Date('2026-10-13T11:00:00Z') });
  await svc.addLog(U, { areaId: work._id, minutes: 30, date: '2026-10-13', note: '' }, NOW);
  const b = await svc.balance(U, '2026-10-15', NOW);
  const row = b.areas[0];
  assert.equal(row.minutes, 90 + 60 + 30);
  assert.equal(row.auto, 150);
  assert.equal(row.manual, 30);
  assert.deepEqual(row.eventTypes, ['meeting']);
});

test('export then restore into an empty account re-creates tasks, goals and links; second restore adds nothing', async () => {
  await models.Goal.create({ tenantId: U.tenantId, createdBy: U.id, title: 'Learn Excel', type: 'short_term', status: 'active', progress: 10, milestones: [{ title: 'm1', isDone: false }] });
  const g = models.Goal.rows[0];
  await models.Task.create({ tenantId: U.tenantId, createdBy: U.id, title: 'Linked task', status: 'not_started', priority: 'high', goalId: g._id, dueDate: new Date('2026-11-01T00:00:00Z') });
  await svc.addEntry(U, { kind: 'lesson', title: 'Categories first', body: '', url: '', tags: ['excel'], pinned: false });
  const backup = await svc.exportBackup(U, NOW);
  assert.ok(backup.sections.tasks.find((t) => t.title === 'Linked task' && t.goalTitle === 'Learn Excel'));
  assert.equal(backup.sections.tasks.some((t) => t.title === 'x'), false, 'only my own tasks');

  const U2 = { id: 'u2'.padEnd(24, '0'), tenantId: 't1'.padEnd(24, '0') };
  const json = JSON.stringify(backup);
  const prev = await svc.previewRestore(U2, Buffer.from(json));
  assert.equal(prev.counts.goals.add, 1);
  assert.ok(prev.counts.tasks.add >= 2);
  await svc.restore(U2, Buffer.from(json), NOW);
  const t = models.Task.rows.find((x) => x.createdBy === U2.id && x.title === 'Linked task');
  assert.ok(t, 'task restored under the new person');
  assert.equal(String(t.goalId), String(models.Goal.rows.find((x) => x.createdBy === U2.id)._id), 'linked to the restored goal');
  assert.equal(models.Task.rows.filter((x) => x.createdBy === U2.id).length, prev.counts.tasks.add);
  const again = await svc.previewRestore(U2, Buffer.from(json));
  assert.equal(again.counts.tasks.add, 0);
  assert.equal(again.counts.goals.add, 0);
  assert.equal(again.counts.knowledge.add, 0);
});

test('without task permission, tasks are not restored', async () => {
  const U3 = { id: 'u3'.padEnd(24, '0'), tenantId: 't1'.padEnd(24, '0'), deny: ['tasks.create'] };
  const json = JSON.stringify(await svc.exportBackup(U, NOW));
  const before = models.Task.rows.length;
  const r = await svc.restore(U3, Buffer.from(json), NOW);
  assert.equal(r.restored.tasks.add, 0);
  assert.ok(r.restored.tasks.noPermission > 0);
  assert.equal(models.Task.rows.length, before);
});

test('a damaged file is refused with a plain message', async () => {
  const json = JSON.stringify(await svc.exportBackup(U, NOW)).replace('Linked task', 'Edited task');
  await assert.rejects(() => svc.previewRestore(U, Buffer.from(json)), /damaged|edited/);
});

test('knowledge search needs every word and only returns the person\'s own entries', async () => {
  const other = { id: 'u9'.padEnd(24, '0'), tenantId: U.tenantId };
  await svc.addEntry(other, { kind: 'note', title: 'secret categories', body: '', url: '', tags: [], pinned: false });
  const r = await svc.listEntries(U, { q: 'categories' });
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0].title, 'Categories first');
});
