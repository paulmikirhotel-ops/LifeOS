// Runs the real session.service.js and deviceLink.service.js against in-memory stand-ins for the database tables.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// The scratch folder lives inside the server folder so zod is found in the project's own node_modules (works on Windows too).
const serverDir = fileURLToPath(new URL('..', import.meta.url));
const root = fs.mkdtempSync(path.join(serverDir, '.tmp-devlink-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));
const src = path.resolve(serverDir, 'src');
const w = (rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
for (const rel of ['utils/deviceLink.logic.js', 'services/session.service.js', 'services/deviceLink.service.js']) w(`src/${rel}`, fs.readFileSync(path.join(src, rel), 'utf8'));
w('node_modules/mongoose/package.json', '{"name":"mongoose","type":"module","main":"index.js"}');
w('node_modules/mongoose/index.js', 'export default { isValidObjectId: (v) => /^[0-9a-fA-F]{24}$/.test(String(v)), models: {} };');
w('src/utils/ApiError.js', `export class ApiError extends Error { constructor(s,m,x){super(m);this.status=s;this.code=x?.code;} static badRequest(m){return new ApiError(400,m);} static unauthorized(m){return new ApiError(401,m);} static notFound(m){return new ApiError(404,m);} }`);
w('src/utils/token.js', `import crypto from 'node:crypto';
export const generateToken = (n = 32) => crypto.randomBytes(n).toString('hex');
export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
export const signRefreshToken = (p) => 'R.' + Buffer.from(JSON.stringify(p)).toString('base64url');
export const signAccessToken = (p) => 'A.' + Buffer.from(JSON.stringify(p)).toString('base64url');`);
w('src/mini.js', `
let n = 1;
const isObj = (v) => v && typeof v === 'object' && !(v instanceof RegExp) && !(v instanceof Date);
const cmp = (a, b) => (a instanceof Date || b instanceof Date ? new Date(a).getTime() - new Date(b).getTime() : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
function one(r, k, v) {
  if (isObj(v)) {
    return Object.entries(v).every(([op, x]) => {
      if (op === '$gt') return r[k] != null && cmp(r[k], x) > 0;
      if (op === '$in') return x.map(String).includes(String(r[k]));
      if (op === '$ne') return String(r[k]) !== String(x);
      return true;
    });
  }
  return String(r[k]) === String(v);
}
const match = (r, q) => Object.entries(q || {}).every(([k, v]) => one(r, k, v));
export function table({ unique = [] } = {}) {
  const rows = [];
  const chain = (list) => {
    let out = [...list];
    const c = {
      sort: (s) => { const [[k, d]] = Object.entries(s); out.sort((a, b) => cmp(a[k], b[k]) * d); return c; },
      skip: (x) => { out = out.slice(x); return c; },
      limit: (x) => { out = out.slice(0, x); return c; },
      select: () => c,
      lean: async () => out.map((x) => ({ ...x })),
      then: (res, rej) => Promise.resolve(out[0] || null).then(res, rej),
    };
    return c;
  };
  return {
    rows,
    find: (q) => { const c = chain(rows.filter((r) => match(r, q))); c.then = (res, rej) => c.lean().then(res, rej); return c; },
    findOne: (q) => chain(rows.filter((r) => match(r, q))),
    findById: (id) => chain(rows.filter((r) => String(r._id) === String(id))),
    create: async (d) => {
      for (const u of unique) if (rows.some((r) => r[u] === d[u])) { const e = new Error('E11000 duplicate key'); e.code = 11000; throw e; }
      const r = { _id: String(n++).padStart(24, '0'), createdAt: new Date(), ...d }; rows.push(r); return r;
    },
    findOneAndUpdate: async (q, u, o) => {
      const r = rows.find((x) => match(x, q)); if (!r) return null;
      const before = { ...r }; Object.assign(r, u.$set || {}); return o?.new ? r : before;
    },
    updateOne: async (q, u) => { const r = rows.find((x) => match(x, q)); if (!r) return { modifiedCount: 0 }; Object.assign(r, u.$set || {}); for (const k of Object.keys(u.$unset || {})) delete r[k]; return { modifiedCount: 1 }; },
    deleteOne: async (q) => { const i = rows.findIndex((x) => match(x, q)); if (i >= 0) rows.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; },
    deleteMany: async (q) => { let c = 0; for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i], q)) { rows.splice(i, 1); c++; } return { deletedCount: c }; },
    countDocuments: async (q) => rows.filter((r) => match(r, q)).length,
  };
}`);
w('src/models/index.js', `import { table } from '../mini.js'; export const User = table();`);
w('src/models/deviceLink.model.js', `import { table } from '../mini.js'; export const UserSession = table({ unique: ['refreshHash'] }); export const QrLogin = table({ unique: ['codeHash'] });`);
w('src/services/auth.service.js', `import { openSession } from './session.service.js';
export async function startSession(user, ctx = {}) { const s = await openSession(user, ctx); return { user: { id: String(user._id), name: user.name }, memberships: [], ...s }; }`);

const imp = (rel) => import(pathToFileURL(path.join(root, rel)).href);
let sess; let link; let M; let U;
test('setup', async () => {
  sess = await imp('src/services/session.service.js'); link = await imp('src/services/deviceLink.service.js');
  M = await imp('src/models/deviceLink.model.js'); U = (await imp('src/models/index.js')).User;
  assert.ok(sess.openSession && link.start);
});

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const APP = 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 LifeOSApp/1.0';
const NOW = new Date('2026-10-29T10:00:00Z');
const later = (ms) => new Date(NOW.getTime() + ms);

let ann; let bob;
test('two people exist', async () => {
  ann = await U.create({ name: 'Ann', status: 'active', isEmailVerified: true });
  bob = await U.create({ name: 'Bob', status: 'active', isEmailVerified: false });
});

// ── several devices at once (the core fix) ───────────────────────────
test('signing in on a second device does NOT sign the first one out', async () => {
  const phone = await sess.openSession(ann, { userAgent: APP, ip: '102.89.34.17', via: 'password' }, NOW);
  const laptop = await sess.openSession(ann, { userAgent: CHROME_WIN, ip: '41.2.3.4' }, later(1000));
  assert.notEqual(phone.refreshToken, laptop.refreshToken);
  const p = await sess.rotateSession(phone.refreshToken, later(2000));      // the phone is still welcome
  const l = await sess.rotateSession(laptop.refreshToken, later(3000));     // and so is the laptop
  assert.ok(p.accessToken && l.accessToken);
  assert.equal(M.UserSession.rows.filter((r) => String(r.userId) === String(ann._id)).length, 2);
});

test('a refresh token works once: the old one stops working after a refresh, and two at the same moment cannot both win', async () => {
  const d = await sess.openSession(ann, { userAgent: CHROME_WIN }, NOW);
  const next = await sess.rotateSession(d.refreshToken, later(1000));
  await assert.rejects(() => sess.rotateSession(d.refreshToken, later(2000)), (e) => e.status === 401);
  const [a, b] = await Promise.allSettled([sess.rotateSession(next.refreshToken, later(3000)), sess.rotateSession(next.refreshToken, later(3000))]);
  assert.equal([a, b].filter((x) => x.status === 'fulfilled').length, 1);
});

test('an expired session is refused and removed; a suspended person cannot refresh', async () => {
  const d = await sess.openSession(ann, { userAgent: CHROME_WIN }, NOW);
  await assert.rejects(() => sess.rotateSession(d.refreshToken, later(8 * 24 * 3600 * 1000)), /expired/);
  const eve = await U.create({ name: 'Eve', status: 'active' });
  const e = await sess.openSession(eve, {}, NOW);
  eve.status = 'suspended';
  await assert.rejects(() => sess.rotateSession(e.refreshToken, later(1000)), (x) => x.status === 401);
  await assert.rejects(() => sess.rotateSession('garbage', NOW), (x) => x.status === 401);
  await assert.rejects(() => sess.rotateSession('', NOW), /No refresh token/);
});

test('a person signed in before this update keeps their sign-in (old token is adopted once)', async () => {
  const old = await U.create({ name: 'Old', status: 'active', refreshTokenHash: link ? (await imp('src/utils/deviceLink.logic.js')) && (await import('node:crypto')).createHash('sha256').update('legacy-token').digest('hex') : '', refreshTokenExpiresAt: later(3 * 24 * 3600 * 1000) });
  const r = await sess.rotateSession('legacy-token', later(1000));
  assert.ok(r.refreshToken && r.refreshToken !== 'legacy-token');
  assert.equal(old.refreshTokenHash, undefined, 'the old single token is gone from the person');
  await assert.rejects(() => sess.rotateSession('legacy-token', later(2000)), (x) => x.status === 401);
  assert.ok((await sess.rotateSession(r.refreshToken, later(3000))).accessToken);
});

test('signing out one device leaves the others; without a token it signs out all; password change signs out all', async () => {
  const cy = await U.create({ name: 'Cy', status: 'active' });
  const a = await sess.openSession(cy, { userAgent: APP }, NOW);
  const b = await sess.openSession(cy, { userAgent: CHROME_WIN }, NOW);
  assert.equal(await sess.closeSession(cy._id, a.refreshToken), 1);
  assert.ok((await sess.rotateSession(b.refreshToken, later(1000))).accessToken);
  await assert.rejects(() => sess.rotateSession(a.refreshToken, later(1000)), (x) => x.status === 401);
  const c = await sess.openSession(cy, {}, NOW);
  assert.equal(await sess.closeSession(cy._id, undefined), 0);
  await assert.rejects(() => sess.rotateSession(c.refreshToken, later(1000)), (x) => x.status === 401);
  const d = await sess.openSession(cy, {}, NOW);
  await sess.revokeAllSessions(cy._id);
  await assert.rejects(() => sess.rotateSession(d.refreshToken, later(1000)), (x) => x.status === 401);
});

test('at most 10 devices: the one used longest ago is signed out first', async () => {
  const dee = await U.create({ name: 'Dee', status: 'active' });
  const tokens = [];
  for (let i = 0; i < 11; i += 1) tokens.push((await sess.openSession(dee, { userAgent: CHROME_WIN }, later(i * 1000))).refreshToken);
  assert.equal(M.UserSession.rows.filter((r) => String(r.userId) === String(dee._id)).length, 10);
  await assert.rejects(() => sess.rotateSession(tokens[0], later(20000)), (x) => x.status === 401);
  assert.ok((await sess.rotateSession(tokens[10], later(20000))).accessToken);
});

test('the device list marks this device and shortens addresses; I can only remove my own devices', async () => {
  const fay = await U.create({ name: 'Fay', status: 'active' });
  const gus = await U.create({ name: 'Gus', status: 'active' });
  const mine = await sess.openSession(fay, { userAgent: APP, ip: '102.89.34.17' }, NOW);
  await sess.openSession(fay, { userAgent: CHROME_WIN, ip: '41.2.3.4' }, later(5000));
  const theirs = await sess.openSession(gus, { userAgent: CHROME_WIN }, NOW);
  const list = (await sess.listDevices(fay._id, mine.refreshToken)).items;
  assert.equal(list.length, 2);
  assert.equal(list.filter((d) => d.current).length, 1);
  assert.equal(list.find((d) => d.current).label, 'LifeOS app on Android');
  assert.equal(list.find((d) => d.current).ip, '102.89.34.•');
  assert.ok(!JSON.stringify(list).includes('refreshHash'));
  const theirId = String(M.UserSession.rows.find((r) => String(r.userId) === String(gus._id))._id);
  await assert.rejects(() => sess.removeDevice(fay._id, theirId), (x) => x.status === 404);
  assert.ok((await sess.rotateSession(theirs.refreshToken, later(1000))).accessToken, 'their device is untouched');
  const other = list.find((d) => !d.current);
  assert.deepEqual(await sess.removeDevice(fay._id, other.id), { removed: true });
  assert.equal((await sess.listDevices(fay._id, mine.refreshToken)).items.length, 1);
  await assert.rejects(() => sess.removeDevice(fay._id, 'not-an-id'), (x) => x.status === 404);
});

// ── Sign in with QR ───────────────────────────────────────────────────
test('QR sign-in, start to finish: computer asks, phone allows, computer is signed in once', async () => {
  const q = await link.start({ userAgent: CHROME_WIN, ip: '41.2.3.4' }, NOW);
  assert.match(q.code, /^[a-f0-9]{48}$/);
  assert.match(q.secret, /^[a-f0-9]{48}$/);
  assert.match(q.pairCode, /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  assert.equal(q.ttlMs, 120000);
  assert.ok(!JSON.stringify(M.QrLogin.rows).includes(q.code), 'the code is stored only as a hash');
  assert.ok(!JSON.stringify(M.QrLogin.rows).includes(q.secret), 'the secret is stored only as a hash');

  assert.equal((await link.status(q.code, q.secret, {}, later(1000))).status, 'pending');

  const seen = await link.peek({ id: String(ann._id) }, q.code, later(2000));
  assert.equal(seen.device.label, 'Chrome on Windows');
  assert.equal(seen.device.ip, '41.2.3.•');
  assert.equal(seen.pairCode, q.pairCode);
  assert.ok(seen.secondsLeft > 100);

  assert.equal((await link.approve({ id: String(ann._id) }, { code: q.code }, { userAgent: APP }, later(3000))).approved, true);

  const done = await link.status(q.code, q.secret, { userAgent: CHROME_WIN, ip: '41.2.3.4' }, later(4000));
  assert.equal(done.status, 'approved');
  assert.equal(done.session.user.name, 'Ann');
  assert.ok(done.session.refreshToken && done.session.accessToken);
  const row = M.UserSession.rows.find((r) => r.refreshHash && r.via === 'qr');
  assert.equal(row.device.label, 'Chrome on Windows', 'the new session is named after the computer, not the phone');
  assert.equal(String(row.userId), String(ann._id));

  assert.equal((await link.status(q.code, q.secret, {}, later(5000))).status, 'used', 'the sign-in can be collected only once');
  assert.ok(!(await link.status(q.code, q.secret, {}, later(5000))).session);
});

test('the phone stays signed in after it approves a computer (both devices work)', async () => {
  const phone = await sess.openSession(ann, { userAgent: APP }, NOW);
  const q = await link.start({ userAgent: CHROME_WIN }, NOW);
  await link.approve({ id: String(ann._id) }, { code: q.code }, {}, later(1000));
  const done = await link.status(q.code, q.secret, { userAgent: CHROME_WIN }, later(2000));
  assert.equal(done.status, 'approved');
  assert.ok((await sess.rotateSession(phone.refreshToken, later(3000))).accessToken);
  assert.ok((await sess.rotateSession(done.session.refreshToken, later(3000))).accessToken);
});

test('a wrong code or a wrong secret looks exactly like an old code', async () => {
  const q = await link.start({ userAgent: CHROME_WIN }, NOW);
  await link.approve({ id: String(ann._id) }, { code: q.code }, {}, later(1000));
  const other = await link.start({ userAgent: CHROME_WIN }, NOW);
  assert.deepEqual(await link.status(q.code, other.secret, {}, later(2000)), { status: 'expired' });
  assert.deepEqual(await link.status('f'.repeat(48), q.secret, {}, later(2000)), { status: 'expired' });
  assert.equal((await link.status(q.code, q.secret, {}, later(2500))).status, 'approved', 'the real computer can still collect it');
});

test('only a verified account can allow a computer in', async () => {
  const q = await link.start({ userAgent: CHROME_WIN }, NOW);
  await assert.rejects(() => link.peek({ id: String(bob._id) }, q.code, NOW), (e) => e.status === 403 && e.code === 'EMAIL_NOT_VERIFIED');
  await assert.rejects(() => link.approve({ id: String(bob._id) }, { code: q.code }, {}, NOW), (e) => e.code === 'EMAIL_NOT_VERIFIED');
  await assert.rejects(() => link.lookup({ id: String(bob._id) }, 'AAAA-AAAA', NOW), (e) => e.code === 'EMAIL_NOT_VERIFIED');
  assert.equal((await link.status(q.code, q.secret, {}, later(1000))).status, 'pending', 'nothing was approved');
});

test('a code lasts 2 minutes: after that it cannot be seen, approved or collected', async () => {
  const q = await link.start({ userAgent: CHROME_WIN }, NOW);
  await assert.rejects(() => link.peek({ id: String(ann._id) }, q.code, later(121_000)), (e) => e.status === 410 && e.code === 'LINK_EXPIRED');
  await assert.rejects(() => link.approve({ id: String(ann._id) }, { code: q.code }, {}, later(121_000)), (e) => e.status === 410);
  assert.equal((await link.status(q.code, q.secret, {}, later(121_000))).status, 'expired');
});

test('Deny ends it: no sign-in is ever given', async () => {
  const q = await link.start({ userAgent: CHROME_WIN }, NOW);
  assert.deepEqual(await link.deny({ id: String(ann._id) }, { code: q.code }, later(1000)), { denied: true });
  assert.equal((await link.status(q.code, q.secret, {}, later(2000))).status, 'denied');
  await assert.rejects(() => link.approve({ id: String(ann._id) }, { code: q.code }, {}, later(3000)), (e) => e.status === 410);
});

test('once approved, nobody else can approve, deny or take over the same code', async () => {
  const cat = await U.create({ name: 'Cat', status: 'active', isEmailVerified: true });
  const q = await link.start({ userAgent: CHROME_WIN }, NOW);
  await link.approve({ id: String(ann._id) }, { code: q.code }, {}, later(1000));
  await assert.rejects(() => link.approve({ id: String(cat._id) }, { code: q.code }, {}, later(2000)), (e) => e.status === 410);
  await assert.rejects(() => link.deny({ id: String(cat._id) }, { code: q.code }, later(2000)), (e) => e.status === 410);
  const done = await link.status(q.code, q.secret, { userAgent: CHROME_WIN }, later(3000));
  assert.equal(done.session.user.name, 'Ann', 'the computer is signed in as the person who approved first');
});

test('an approval that the computer never collects expires after 30 seconds', async () => {
  const q = await link.start({ userAgent: CHROME_WIN }, NOW);
  await link.approve({ id: String(ann._id) }, { code: q.code }, {}, later(1000));
  assert.equal((await link.status(q.code, q.secret, {}, later(1000 + 31_000))).status, 'expired');
});

test('typing the pair code works (lower case, no dash) and returns a reference to approve with', async () => {
  const q = await link.start({ userAgent: CHROME_WIN, ip: '41.2.3.4' }, NOW);
  const typed = q.pairCode.replace('-', '').toLowerCase();
  const found = await link.lookup({ id: String(ann._id) }, typed, later(1000));
  assert.match(found.ref, /^[0-9]{24}$/);
  assert.equal(found.device.label, 'Chrome on Windows');
  assert.equal((await link.approve({ id: String(ann._id) }, { ref: found.ref }, {}, later(2000))).approved, true);
  assert.equal((await link.status(q.code, q.secret, { userAgent: CHROME_WIN }, later(3000))).status, 'approved');
  await assert.rejects(() => link.lookup({ id: String(ann._id) }, 'nonsense', later(1000)), (e) => e.status === 400);
  await assert.rejects(() => link.lookup({ id: String(ann._id) }, 'AAAA-AAAA', later(1000)), (e) => e.status === 410);
});
