// Runs the real session.service.js and fcm.service.js against in-memory tables and a pretend Google.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const serverDir = fileURLToPath(new URL('..', import.meta.url));
const root = fs.mkdtempSync(path.join(serverDir, '.tmp-fcm-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));
const src = path.resolve(serverDir, 'src');
const w = (rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
for (const rel of ['utils/deviceLink.logic.js', 'services/session.service.js', 'services/fcm.service.js']) w(`src/${rel}`, fs.readFileSync(path.join(src, rel), 'utf8'));
w('node_modules/mongoose/package.json', '{"name":"mongoose","type":"module","main":"index.js"}');
w('node_modules/mongoose/index.js', 'export default { isValidObjectId: (v) => /^[0-9a-fA-F]{24}$/.test(String(v)), models: {} };');
w('src/utils/ApiError.js', `export class ApiError extends Error { constructor(s,m){super(m);this.status=s;} static badRequest(m){return new ApiError(400,m);} static unauthorized(m){return new ApiError(401,m);} static notFound(m){return new ApiError(404,m);} }`);
w('src/utils/token.js', `import crypto from 'node:crypto';
export const generateToken = (n = 32) => crypto.randomBytes(n).toString('hex');
export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
export const signRefreshToken = (p) => 'R.' + Buffer.from(JSON.stringify(p)).toString('base64url');
export const signAccessToken = (p) => 'A.' + Buffer.from(JSON.stringify(p)).toString('base64url');`);
w('src/mini.js', `
let n = 1;
const isObj = (v) => v && typeof v === 'object' && !(v instanceof Date);
const cmp = (a, b) => (a instanceof Date || b instanceof Date ? new Date(a).getTime() - new Date(b).getTime() : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
function one(r, k, v) {
  if (isObj(v)) return Object.entries(v).every(([op, x]) => op === '$gt' ? r[k] != null && cmp(r[k], x) > 0 : op === '$ne' ? String(r[k] ?? '') !== String(x) : op === '$in' ? x.map(String).includes(String(r[k])) : true);
  return String(r[k] ?? '') === String(v);
}
const match = (r, q) => Object.entries(q || {}).every(([k, v]) => one(r, k, v));
export function table() {
  const rows = [];
  const chain = (list) => { let out = [...list]; const c = { sort: () => c, skip: (x) => { out = out.slice(x); return c; }, select: () => c, lean: async () => out.map((x) => ({ ...x })), then: (a, b) => Promise.resolve(out[0] || null).then(a, b) }; return c; };
  return { rows,
    find: (q) => { const c = chain(rows.filter((r) => match(r, q))); c.then = (a, b) => c.lean().then(a, b); return c; },
    findOne: (q) => chain(rows.filter((r) => match(r, q))),
    findById: (id) => chain(rows.filter((r) => String(r._id) === String(id))),
    create: async (d) => { const r = { _id: String(n++).padStart(24, '0'), ...d }; rows.push(r); return r; },
    updateOne: async (q, u) => { const r = rows.find((x) => match(x, q)); if (r) Object.assign(r, u.$set || {}); return { modifiedCount: r ? 1 : 0 }; },
    updateMany: async (q, u) => { rows.filter((x) => match(x, q)).forEach((r) => Object.assign(r, u.$set || {})); return {}; },
    deleteMany: async (q) => { for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i], q)) rows.splice(i, 1); return {}; },
    countDocuments: async (q) => rows.filter((r) => match(r, q)).length };
}`);
w('src/models/index.js', `import { table } from '../mini.js'; export const User = table(); User.rows.push({ _id: '000000000000000000000c01', status: 'active' });`);
w('src/models/deviceLink.model.js', `import { table } from '../mini.js'; export const UserSession = table(); export const QrLogin = table();`);

const imp = (rel) => import(pathToFileURL(path.join(root, rel)).href);
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
const ACCT = { project_id: 'lifeos-test', client_email: 'push@lifeos-test.iam.gserviceaccount.com', private_key: KEY, token_uri: 'https://oauth2.example/token' };
let sess; let fcm; let M;
const NOW = new Date('2026-10-30T10:00:00Z');
const TOK = (c) => `${c}`.repeat(30);

test('setup', async () => { sess = await imp('src/services/session.service.js'); fcm = await imp('src/services/fcm.service.js'); M = await imp('src/models/deviceLink.model.js'); assert.ok(fcm.sendCallPush); });

function pretendGoogle({ sendStatus = 200, sendBody = {} } = {}) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    if (url === ACCT.token_uri) return { ok: true, status: 200, json: async () => ({ access_token: 'g-access', expires_in: 3600 }) };
    return { ok: sendStatus < 400, status: sendStatus, json: async () => sendBody };
  };
  return { fetchFn, calls };
}
const user = (id) => ({ _id: id, status: 'active' });

test('the setting is read as JSON or base64, and broken or missing values mean "off"', () => {
  assert.equal(fcm.readAccount(''), null);
  assert.equal(fcm.readAccount('not json'), null);
  assert.equal(fcm.readAccount(JSON.stringify({ project_id: 'x' })), null);
  assert.equal(fcm.readAccount(JSON.stringify(ACCT)).projectId, 'lifeos-test');
  assert.equal(fcm.readAccount(Buffer.from(JSON.stringify(ACCT)).toString('base64')).email, ACCT.client_email);
  assert.match(fcm.readAccount(JSON.stringify({ ...ACCT, private_key: KEY.replace(/\n/g, '\\n') })).key, /BEGIN PRIVATE KEY-----\n/);
});

test('the Google sign-in token is a valid RS256 signature with the right claims, and is reused', async () => {
  fcm.resetTokenCache();
  const g = pretendGoogle();
  const acct = fcm.readAccount(JSON.stringify(ACCT));
  const t1 = await fcm.accessToken(acct, { fetchFn: g.fetchFn, now: 1_700_000_000_000 });
  assert.equal(t1, 'g-access');
  const form = new URLSearchParams(g.calls[0].init.body);
  assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  const [h, b, s] = form.get('assertion').split('.');
  assert.equal(JSON.parse(Buffer.from(h, 'base64url')).alg, 'RS256');
  const claims = JSON.parse(Buffer.from(b, 'base64url'));
  assert.equal(claims.iss, ACCT.client_email);
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/firebase.messaging');
  assert.equal(claims.aud, ACCT.token_uri);
  assert.equal(claims.exp - claims.iat, 3600);
  assert.ok(crypto.createVerify('RSA-SHA256').update(`${h}.${b}`).verify(publicKey, Buffer.from(s, 'base64url')));
  await fcm.accessToken(acct, { fetchFn: g.fetchFn, now: 1_700_000_100_000 });
  assert.equal(g.calls.length, 1, 'second call reused the token');
  await fcm.accessToken(acct, { fetchFn: g.fetchFn, now: 1_700_000_000_000 + 3_600_000 });
  assert.equal(g.calls.length, 2, 'a new one after it nearly ends');
});

test('the message is high priority, short-lived, in the calls channel, and carries only what the app needs', () => {
  const m = fcm.buildMessage('tok', { title: 'Ann is calling', body: 'Incoming voice call', callId: 'c1' }).message;
  assert.equal(m.token, 'tok');
  assert.equal(m.android.priority, 'HIGH');
  assert.equal(m.android.ttl, '30s');
  assert.equal(m.android.notification.channel_id, 'calls_ring');
  assert.deepEqual(m.data, { url: '/connect', type: 'call', callId: 'c1' });
  assert.equal(m.notification.title, 'Ann is calling');
});

test('a push token belongs to this device: it is saved on the session, moves if another account uses the phone, and ends at sign-out', async () => {
  const a = await sess.openSession(user('000000000000000000000a01'), { userAgent: 'x LifeOSApp/1.0' }, NOW);
  const b = await sess.openSession(user('000000000000000000000b01'), { userAgent: 'y' }, NOW);
  await assert.rejects(() => sess.setPushToken('000000000000000000000a01', a.refreshToken, 'short'), (e) => e.status === 400);
  await assert.rejects(() => sess.setPushToken('000000000000000000000a01', 'nope', TOK('a')), (e) => e.status === 401);
  await assert.rejects(() => sess.setPushToken('000000000000000000000b01', a.refreshToken, TOK('a')), (e) => e.status === 401, "someone else's session cannot be used");
  await sess.setPushToken('000000000000000000000a01', a.refreshToken, TOK('a'));
  assert.deepEqual(await sess.pushTokensFor('000000000000000000000a01'), [TOK('a')]);
  await sess.setPushToken('000000000000000000000b01', b.refreshToken, TOK('a')); // the same phone, now signed in as B
  assert.deepEqual(await sess.pushTokensFor('000000000000000000000a01'), []);
  assert.deepEqual(await sess.pushTokensFor('000000000000000000000b01'), [TOK('a')]);
  await sess.closeSession('000000000000000000000b01', b.refreshToken);
  assert.deepEqual(await sess.pushTokensFor('000000000000000000000b01'), [], 'signed out: no more ringing');
});

test('removing the token keeps the sign-in', async () => {
  const c = await sess.openSession(user('000000000000000000000c01'), {}, NOW);
  await sess.setPushToken('000000000000000000000c01', c.refreshToken, TOK('c'));
  await sess.clearPushToken('000000000000000000000c01', c.refreshToken);
  assert.deepEqual(await sess.pushTokensFor('000000000000000000000c01'), []);
  assert.equal(M.UserSession.rows.filter((r) => String(r.userId) === '000000000000000000000c01').length, 1, 'the device is still signed in');
});

test('a call rings every phone of the person once, and nobody else', async () => {
  process.env.FCM_SERVICE_ACCOUNT = JSON.stringify(ACCT); fcm.resetTokenCache();
  const id = '000000000000000000000d01';
  const p1 = await sess.openSession(user(id), {}, NOW); const p2 = await sess.openSession(user(id), {}, NOW);
  await sess.setPushToken(id, p1.refreshToken, TOK('d')); await sess.setPushToken(id, p2.refreshToken, TOK('e'));
  const other = await sess.openSession(user('000000000000000000000d02'), {}, NOW); await sess.setPushToken('000000000000000000000d02', other.refreshToken, TOK('f'));
  const g = pretendGoogle();
  const n = await fcm.sendCallPush(id, { title: 'Ann is calling', body: 'Incoming voice call', callId: 'c9' }, { fetchFn: g.fetchFn });
  assert.equal(n, 2);
  const sends = g.calls.filter((c) => c.url.includes('/messages:send'));
  assert.equal(sends.length, 2);
  assert.ok(sends.every((s) => s.url === 'https://fcm.googleapis.com/v1/projects/lifeos-test/messages:send' && s.init.headers.authorization === 'Bearer g-access'));
  assert.deepEqual(sends.map((s) => JSON.parse(s.init.body).message.token).sort(), [TOK('d'), TOK('e')]);
});

test('an uninstalled app (Google says unregistered) is forgotten; other failures do not stop the call', async () => {
  process.env.FCM_SERVICE_ACCOUNT = JSON.stringify(ACCT); fcm.resetTokenCache();
  const id = '000000000000000000000e01';
  const p = await sess.openSession(user(id), {}, NOW); await sess.setPushToken(id, p.refreshToken, TOK('g'));
  const gone = pretendGoogle({ sendStatus: 404, sendBody: { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } } });
  assert.equal(await fcm.sendCallPush(id, { title: 't', body: 'b', callId: '1' }, { fetchFn: gone.fetchFn }), 0);
  assert.deepEqual(await sess.pushTokensFor(id), []);
  const p2 = await sess.openSession(user(id), {}, NOW); await sess.setPushToken(id, p2.refreshToken, TOK('h'));
  const down = pretendGoogle({ sendStatus: 503, sendBody: {} });
  assert.equal(await fcm.sendCallPush(id, { title: 't', body: 'b', callId: '1' }, { fetchFn: down.fetchFn }), 0);
  assert.deepEqual(await sess.pushTokensFor(id), [TOK('h')], 'a temporary failure keeps the token');
  const boom = async () => { throw new Error('network'); };
  assert.equal(await fcm.sendCallPush(id, { title: 't', body: 'b', callId: '1' }, { fetchFn: boom }), 0, 'never throws');
});

test('not configured or nobody registered: nothing is sent and nothing breaks', async () => {
  delete process.env.FCM_SERVICE_ACCOUNT;
  const g = pretendGoogle();
  assert.equal(await fcm.sendCallPush('000000000000000000000d01', { title: 't', body: 'b' }, { fetchFn: g.fetchFn }), 0);
  assert.equal(g.calls.length, 0);
  process.env.FCM_SERVICE_ACCOUNT = JSON.stringify(ACCT);
  assert.equal(await fcm.sendCallPush('000000000000000000000f99', { title: 't', body: 'b' }, { fetchFn: g.fetchFn }), 0);
  assert.equal(g.calls.length, 0, 'no phones, so Google is not even asked for a token');
  assert.equal(fcm.fcmConfigured(), true);
  delete process.env.FCM_SERVICE_ACCOUNT;
});
