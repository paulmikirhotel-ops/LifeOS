// Runs the real resources and sessions services against in-memory stand-ins for the database and the Connect helpers.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// The scratch folder is made inside the server folder so zod is found in the project's own node_modules (works on Windows too).
const serverDir = fileURLToPath(new URL('..', import.meta.url));
const root = fs.mkdtempSync(path.join(serverDir, '.tmp-cxsvc-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));
const src = path.resolve(serverDir, 'src');
const w = (rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
for (const rel of ['utils/communityExtras.logic.js', 'utils/community.logic.js', 'services/resources.service.js', 'services/sessions.service.js']) w(`src/${rel}`, fs.readFileSync(path.join(src, rel), 'utf8'));

w('src/utils/ApiError.js', `export class ApiError extends Error { constructor(s,m,x){super(m);this.status=s;this.code=x?.code;} static badRequest(m){return new ApiError(400,m);} static notFound(m){return new ApiError(404,m);} static conflict(m){return new ApiError(409,m);} }`);
w('src/mini.js', `
let n = 1;
const isPlain = (v) => v && typeof v === 'object' && !(v instanceof Date) && !(v instanceof RegExp) && !Array.isArray(v);
const val = (x) => (x instanceof Date ? x.getTime() : x);
function opOk(a, op, x) {
  if (op === '$in') return x.map(String).includes(String(a));
  if (op === '$nin') return !x.map(String).includes(String(a));
  if (op === '$ne') return String(a) !== String(x);
  if (op === '$gt') return val(a) > val(x);
  if (op === '$gte') return val(a) >= val(x);
  if (op === '$lt') return val(a) < val(x);
  if (op === '$lte') return val(a) <= val(x);
  return true;
}
export function table() {
  const rows = [];
  const match = (r, q) => Object.entries(q || {}).every(([k, v]) => {
    if (k === '$or') return v.some((c) => match(r, c));
    if (isPlain(v)) return Object.entries(v).every(([op, x]) => opOk(r[k], op, x));
    if (v instanceof RegExp) return v.test(r[k] ?? '');
    return String(val(r[k])) === String(val(v));
  });
  const chain = (list) => { const c = { sort: (s) => { const [k, d] = Object.entries(s || {})[0] || []; if (k) list.sort((a, b) => (val(a[k]) > val(b[k]) ? 1 : -1) * d); return c; }, limit: () => c, select: () => c, lean: async () => list.map((x) => ({ ...x })), then: (res, rej) => c.lean().then(res, rej) }; return c; };
  const apply = (r, u) => { Object.assign(r, u.$set || {}); if (u.$push) for (const [k, v] of Object.entries(u.$push)) (r[k] = r[k] || []).push(v); };
  const T = {
    rows,
    find: (q) => chain(rows.filter((r) => match(r, q))),
    findOne: (q) => { const r = rows.find((x) => match(x, q)); const c = chain(r ? [r] : []); c.lean = async () => (r ? { ...r } : null); return c; },
    findById: (id) => T.findOne({ _id: id }),
    countDocuments: async (q) => rows.filter((r) => match(r, q)).length,
    distinct: async (k, q) => [...new Set(rows.filter((r) => match(r, q)).map((r) => String(r[k])))],
    create: async (d) => { const r = { _id: d._id || String(n++).padStart(24, '0'), createdAt: new Date(), ...(T.defaults || {}), ...d }; if (T.unique && rows.some((x) => T.unique.every((k) => String(x[k]) === String(r[k])))) { const e = new Error('dup'); e.code = 11000; throw e; } rows.push(r); return { ...r, toObject: () => ({ ...r }) }; },
    findOneAndUpdate: (q, u) => { const r = rows.find((x) => match(x, q)); if (r) apply(r, u); const c = chain(r ? [r] : []); c.lean = async () => (r ? { ...r } : null); c.then = (res, rej) => Promise.resolve(r ? { ...r } : null).then(res, rej); return c; },
    findByIdAndUpdate: (id, u) => T.findOneAndUpdate({ _id: id }, u),
    findOneAndDelete: async (q) => { const i = rows.findIndex((x) => match(x, q)); return i < 0 ? null : rows.splice(i, 1)[0]; },
    findByIdAndDelete: (id) => T.findOneAndDelete({ _id: id }),
    updateOne: async (q, u) => { const r = rows.find((x) => match(x, q)); if (r) apply(r, u); return { modifiedCount: r ? 1 : 0 }; },
    updateMany: async (q, u) => { const k = rows.filter((x) => match(x, q)); for (const x of k) apply(x, u); return { modifiedCount: k.length }; },
  };
  return T;
}`);
w('src/models/index.js', `import { table } from '../mini.js'; export const User = table(); export const CalendarEvent = table();`);
w('src/models/community.model.js', `import { table } from '../mini.js'; export const CommunityProfile = table(); export const CommunityRequest = table();`);
w('src/models/communityExtras.model.js', `import { table } from '../mini.js'; export const LearningResource = table(); LearningResource.unique = ['ownerId', 'url']; LearningResource.defaults = { status: 'open' }; export const ResourceReport = table(); ResourceReport.unique = ['reporterId', 'resourceId']; ResourceReport.defaults = { status: 'open' }; export const MentorSession = table(); MentorSession.defaults = { status: 'proposed', reminderSent: false, calendar: [] };`);
w('src/services/communityShared.js', `
import { assertNoContact } from '../utils/community.logic.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/index.js';
export const oid = (v) => String(v);
export const DAY = 86400000;
export const needId = (v, what) => { if (!/^[0-9a-zA-Z]{24}$/.test(String(v))) throw ApiError.notFound(what + ' not found.'); return String(v); };
export const guardContact = (f) => { try { assertNoContact(f); } catch (e) { throw ApiError.badRequest(e.message); } };
export const nameOf = (p) => (p?.enabled && p.displayName ? p.displayName : 'Community member');
export const activeUsers = async (ids) => new Set((await User.find({ _id: { $in: ids }, status: 'active' }).lean()).map((u) => String(u._id)));
`);
w('src/services/connectSafety.service.js', `
export const blocks = new Set();
const key = (a, b) => [String(a), String(b)].sort().join('|');
export const isBlockedEither = async (a, b) => blocks.has(key(a, b));
export const blockedWith = async (me) => [...blocks].map((k) => k.split('|')).filter((p) => p.includes(String(me))).map((p) => p.find((x) => x !== String(me)));
export const block = (a, b) => blocks.add(key(a, b));
`);
w('src/services/connectNotify.service.js', `export const sent = []; export const notify = async (to, p) => { sent.push({ to: String(to), ...p }); };`);

let R; let S; let M; let CM; let IDX; let SAFE; let NOTE; let X;
const imp = (rel) => import(pathToFileURL(path.join(root, rel)).href);
test('setup', async () => {
  R = await imp('src/services/resources.service.js'); S = await imp('src/services/sessions.service.js'); M = await imp('src/models/communityExtras.model.js');
  CM = await imp('src/models/community.model.js'); IDX = await imp('src/models/index.js'); SAFE = await imp('src/services/connectSafety.service.js'); NOTE = await imp('src/services/connectNotify.service.js');
  X = await imp('src/utils/communityExtras.logic.js');
  assert.ok(R.shareResource && S.propose);
});

const id = (c) => c.repeat(24);
const A = id('a'); const B = id('b'); const C = id('c'); const D = id('d'); const E = id('e'); const F = id('f');
const NOW = new Date(); // the stand-in database stamps rows with the real clock, so the tests use it too
const at = (min) => new Date(NOW.getTime() + min * 60000).toISOString();
const old = new Date('2020-01-01T00:00:00Z');

test('people exist', async () => {
  for (const u of [A, B, C, D, E, F]) await IDX.User.create({ _id: u, status: 'active', createdAt: old });
  await IDX.User.create({ _id: id('n'), status: 'active', createdAt: new Date(NOW.getTime() - 3600000) }); // an hour-old account
  for (const [u, name] of [[A, 'Ann'], [B, 'Ben'], [C, 'Cy'], [D, 'Dee'], [E, 'Eli']]) await CM.CommunityProfile.create({ userId: u, enabled: true, displayName: name, offers: ['excel'], wants: [] });
  await CM.CommunityRequest.create({ kind: 'mentor', status: 'accepted', fromId: B, toId: A });
  await CM.CommunityRequest.create({ kind: 'mentor', status: 'pending', fromId: C, toId: A });
});

// ───────────────────────── resources ─────────────────────────
const res = (over = {}) => ({ title: 'Pivot tables in 10 minutes', url: 'https://example.org/pivot', skill: 'Excel', note: 'Short and clear', ...over });

test('sharing needs a switched-on profile, a clean link, and no contact details or money asks', async () => {
  await assert.rejects(() => R.shareResource(F, res(), NOW), /Switch on your community profile/);
  await assert.rejects(() => R.shareResource(A, res({ url: 'javascript:alert(1)' }), NOW), /Only http and https/);
  await assert.rejects(() => R.shareResource(A, res({ note: 'call me on 0803 123 4567' }), NOW), /phone numbers/);
  await assert.rejects(() => R.shareResource(A, res({ title: 'Pay a registration fee to join' }), NOW), /free help|pay or send money/i);
  const r = await R.shareResource(A, res(), NOW);
  assert.equal(r.resource.domain, 'example.org');
  assert.equal(r.resource.skill, 'excel', 'the skill word is cleaned');
  assert.equal(r.resource.ownerName, 'Ann');
  await assert.rejects(() => R.shareResource(A, res(), NOW), /already shared/);
});

test('a brand-new account waits before sharing links', async () => {
  await CM.CommunityProfile.create({ userId: id('n'), enabled: true, displayName: 'Newbie', offers: ['x1'], wants: [] });
  await assert.rejects(() => R.shareResource(id('n'), res({ url: 'https://example.org/new' }), NOW), /New accounts can share after/);
});

test('limits: 5 a day and 20 in total', async () => {
  for (let i = 0; i < 4; i++) await R.shareResource(A, res({ title: `Guide number ${i}`, url: `https://example.org/${i}` }), NOW); // 1 earlier + 4 = 5 today
  await assert.rejects(() => R.shareResource(A, res({ url: 'https://example.org/x' }), NOW), /up to 5 resources a day/);
  const later = new Date(NOW.getTime() + 2 * 86400000);
  while (M.LearningResource.rows.filter((r) => r.ownerId === A).length < 20) await M.LearningResource.create({ ownerId: A, title: 't', url: `https://example.org/fill${M.LearningResource.rows.length}`, domain: 'example.org', skill: 'excel', status: 'open', createdAt: old });
  await assert.rejects(() => R.shareResource(A, res({ url: 'https://example.org/y' }), later), /up to 20 shared resources/);
  M.LearningResource.rows.splice(0, M.LearningResource.rows.length, ...M.LearningResource.rows.filter((r) => r.title !== 't')); // tidy for later tests
});

test('listing: other people see it; blocked people and switched-off profiles do not; "mine" shows my own', async () => {
  const forB = await R.listResources(B, {});
  assert.ok(forB.items.length >= 5);
  assert.ok(forB.items.every((i) => i.ownerName === 'Ann' && i.isOwner === false));
  assert.equal((await R.listResources(B, { q: 'pivot' })).items.length, 1);
  assert.equal((await R.listResources(B, { skill: 'EXCEL' })).items.length, forB.items.length);
  assert.equal((await R.listResources(B, { skill: 'health' })).items.length, 0);
  SAFE.block(A, B);
  assert.equal((await R.listResources(B, {})).items.length, 0, 'blocked either way: hidden');
  SAFE.blocks.clear();
  CM.CommunityProfile.rows.find((p) => p.userId === A).enabled = false;
  assert.equal((await R.listResources(B, {})).items.length, 0, 'profile switched off: hidden');
  assert.ok((await R.listResources(A, { mine: true })).items.length >= 5);
  CM.CommunityProfile.rows.find((p) => p.userId === A).enabled = true;
});

test('three different people reporting hide it; the same person twice counts once; a dismissal can bring it back', async () => {
  const target = M.LearningResource.rows.find((r) => r.url === 'https://example.org/pivot')._id;
  await assert.rejects(() => R.reportResource(A, target, { reason: 'spam' }, NOW), /not found/, 'cannot report your own');
  await R.reportResource(B, target, { reason: 'spam' }, NOW);
  await R.reportResource(B, target, { reason: 'spam' }, NOW);
  await R.reportResource(C, target, { reason: 'inappropriate', details: 'bad' }, NOW);
  assert.equal(M.LearningResource.rows.find((r) => r._id === target).status, 'open', 'two people so far');
  await R.reportResource(D, target, { reason: 'asks_for_money' }, NOW);
  assert.equal(M.LearningResource.rows.find((r) => r._id === target).status, 'hidden');
  assert.equal((await R.listResources(E, { q: 'pivot' })).items.length, 0, 'hidden from others');
  assert.equal((await R.listResources(A, { mine: true, q: 'pivot' })).items[0].status, 'hidden', 'the owner sees that it is hidden');
  const adminList = await R.adminListResourceReports({ status: 'open' });
  assert.equal(adminList.items.length, 3);
  assert.equal(adminList.items[0].resourceStatus, 'hidden');
  assert.match(adminList.items[0].snapshot, /Pivot tables/);
  await R.adminSetResourceReportStatus(adminList.items[0].id, 'dismissed');
  assert.equal(M.LearningResource.rows.find((r) => r._id === target).status, 'open', 'only 2 open reports remain, so it is shown again');
});

test('removing: only the owner; an admin can remove any', async () => {
  const mineRow = M.LearningResource.rows.find((r) => r.url === 'https://example.org/0')._id;
  await assert.rejects(() => R.removeResource(B, mineRow), /not found/);
  assert.deepEqual(await R.removeResource(A, mineRow), { removed: true });
  const other = M.LearningResource.rows.find((r) => r.url === 'https://example.org/1')._id;
  assert.deepEqual(await R.adminRemoveResource(other), { removed: true });
  await assert.rejects(() => R.adminRemoveResource(other), /not found/);
});

// ───────────────────────── sessions ─────────────────────────
test('partners: only accepted mentor requests, with the other person\'s role, never blocked people', async () => {
  const forB = await S.partners(B);
  assert.deepEqual(forB.items.map((p) => [p.name, p.role]), [['Ann', 'mentor']]);
  const forA = await S.partners(A);
  assert.deepEqual(forA.items.map((p) => [p.name, p.role]), [['Ben', 'learner']], 'a pending request is not enough');
  SAFE.block(A, B);
  assert.equal((await S.partners(A)).items.length, 0);
  SAFE.blocks.clear();
});

test('proposing: partners only, clean note, real time, no double booking for the proposer', async () => {
  await assert.rejects(() => S.propose(C, { userId: A, startsAt: at(60), minutes: 30 }, NOW), /after a mentor request between you was accepted/);
  await assert.rejects(() => S.propose(B, { userId: A, startsAt: at(60), minutes: 30, note: 'ring me 08031234567' }, NOW), /phone numbers/);
  await assert.rejects(() => S.propose(B, { userId: A, startsAt: at(2), minutes: 30 }, NOW), /at least 10 minutes/);
  await assert.rejects(() => S.propose(B, { userId: B, startsAt: at(60), minutes: 30 }, NOW), /someone else/);
  const p = await S.propose(B, { userId: A, startsAt: at(60), minutes: 30, note: 'pivot tables' }, NOW);
  assert.equal(p.status, 'proposed');
  assert.ok(NOTE.sent.some((n) => n.to === A && n.type === 'community_request' && /Ben proposed/.test(n.title)));
  await assert.rejects(() => S.propose(B, { userId: A, startsAt: at(60), minutes: 30 }, NOW), /already proposed/);
});

test('answering: only the person asked, accepting closes the loop, and nobody gets double-booked', async () => {
  const l = await S.listSessions(A, NOW);
  assert.equal(l.waitingForYou.length, 1);
  assert.equal(l.waitingForYou[0].withName, 'Ben');
  const sid = l.waitingForYou[0].id;
  await assert.rejects(() => S.respond(B, sid, 'accept', NOW), /no longer open/, 'the proposer cannot accept their own proposal');
  assert.deepEqual(await S.respond(A, sid, 'accept', NOW), { status: 'accepted' });
  assert.ok(NOTE.sent.some((n) => n.to === B && /accepted your session time/.test(n.title)));
  await assert.rejects(() => S.respond(A, sid, 'accept', NOW), /no longer open/, 'a second tap changes nothing');
  assert.equal((await S.listSessions(B, NOW)).upcoming.length, 1);
  // an overlapping proposal from someone else to Ann cannot be accepted
  await CM.CommunityRequest.create({ kind: 'mentor', status: 'accepted', fromId: D, toId: A });
  const p2 = await S.propose(D, { userId: A, startsAt: at(75), minutes: 30 }, NOW);
  await assert.rejects(() => S.respond(A, p2.id, 'accept', NOW), /already has a session at that time/);
});

test('suggesting another time closes the old proposal and sends a new one back', async () => {
  const waiting = (await S.listSessions(A, NOW)).waitingForYou;
  assert.equal(waiting.length, 1);
  const r = await S.counter(A, waiting[0].id, { startsAt: at(200), minutes: 45, note: 'later is better' }, NOW);
  assert.equal(r.status, 'proposed');
  const forD = await S.listSessions(D, NOW);
  assert.equal(forD.waitingForYou.length, 1);
  assert.equal(forD.waitingForYou[0].minutes, 45);
  assert.equal(forD.recent.filter((s) => s.state === 'countered').length, 1);
  await assert.rejects(() => S.counter(A, waiting[0].id, { startsAt: at(300), minutes: 30 }, NOW), /no longer open/, 'the old one is closed');
});

test('cancelling: either person before the start; nobody else; not after it started', async () => {
  const sid = (await S.listSessions(B, NOW)).upcoming[0].id;
  await assert.rejects(() => S.cancel(C, sid, NOW), /can no longer be cancelled/);
  assert.deepEqual(await S.cancel(B, sid, NOW), { status: 'cancelled' });
  assert.ok(NOTE.sent.some((n) => n.to === A && /cancelled the session/.test(n.title)));
  await assert.rejects(() => S.cancel(B, sid, NOW), /can no longer be cancelled/);
});

test('daily proposal limit', async () => {
  await CM.CommunityRequest.create({ kind: 'mentor', status: 'accepted', fromId: E, toId: A });
  for (let i = 0; i < 10; i++) await S.propose(E, { userId: A, startsAt: at(1000 + i * 60), minutes: 30 }, NOW).catch((e) => { throw e; });
  await assert.rejects(() => S.propose(E, { userId: A, startsAt: at(5000), minutes: 30 }, NOW), /up to 10 sessions a day|proposals waiting/);
});

test('blocking someone cancels the upcoming sessions between you, with no change to Connect', async () => {
  // make a fresh accepted session between A and B
  const p = await S.propose(B, { userId: A, startsAt: at(400), minutes: 30 }, NOW);
  await S.respond(A, p.id, 'accept', NOW);
  assert.equal((await S.listSessions(B, NOW)).upcoming.length, 1);
  SAFE.block(A, B);
  const after = await S.listSessions(B, NOW);
  assert.equal(after.upcoming.length, 0);
  assert.equal(M.MentorSession.rows.find((s) => String(s._id) === String(p.id)).status, 'cancelled');
  SAFE.blocks.clear();
});

test('reminders go out once, to both people, only for sessions starting soon', async () => {
  const p = await S.propose(B, { userId: A, startsAt: at(20), minutes: 30 }, NOW);
  await S.respond(A, p.id, 'accept', NOW);
  NOTE.sent.length = 0;
  assert.deepEqual(await S.sendReminders(NOW), { sent: 1 });
  const rem = NOTE.sent.filter((n) => /starts in about/.test(n.title));
  assert.deepEqual(rem.map((n) => n.to).sort(), [A, B].sort());
  assert.match(rem[0].title, /about 20 minutes/);
  assert.deepEqual(await S.sendReminders(NOW), { sent: 0 }, 'not twice');
});

test('reminders skip people who blocked each other', async () => {
  const p = await S.propose(B, { userId: A, startsAt: at(25), minutes: 15 }, NOW).catch(() => null);
  // the slot may clash with the previous session; use a different pair instead
  await CM.CommunityRequest.create({ kind: 'mentor', status: 'accepted', fromId: C, toId: E });
  const q = await S.propose(C, { userId: E, startsAt: at(15), minutes: 15 }, NOW);
  await S.respond(E, q.id, 'accept', NOW);
  SAFE.block(C, E);
  NOTE.sent.length = 0;
  await S.sendReminders(NOW);
  assert.equal(NOTE.sent.filter((n) => /starts in about/.test(n.title)).length, 0);
  SAFE.blocks.clear();
  assert.ok(p === null || p.status === 'proposed');
});

test('adding to my calendar: only when asked, once, for my own calendar', async () => {
  const U = { id: B, tenantId: 't1'.padEnd(24, '0') };
  const sid = M.MentorSession.rows.find((s) => s.status === 'accepted' && s.proposerId === B && new Date(s.startsAt).getTime() === new Date(at(20)).getTime())._id;
  assert.equal(IDX.CalendarEvent.rows.length, 0, 'nothing is added automatically');
  await assert.rejects(() => S.addToCalendar({ id: B }, sid, NOW), /Choose a workspace/);
  assert.deepEqual(await S.addToCalendar(U, sid, NOW), { added: true });
  assert.equal(IDX.CalendarEvent.rows.length, 1);
  const ev = IDX.CalendarEvent.rows[0];
  assert.equal(ev.userId, B);
  assert.equal(ev.title, 'Mentoring session with Ann');
  assert.equal(new Date(ev.endAt).getTime() - new Date(ev.startAt).getTime(), 30 * 60000);
  await assert.rejects(() => S.addToCalendar(U, sid, NOW), /already in your calendar/);
  await assert.rejects(() => S.addToCalendar({ id: C, tenantId: U.tenantId }, sid, NOW), /not coming up/, 'a stranger cannot add it');
});
