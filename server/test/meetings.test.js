/**
 * Meetings module tests (Phase 2) — API, access control and calendar linkage.
 *
 * Run (needs a MongoDB; uses its own `lifeos_test_meetings` database and wipes it):
 *   MONGODB_URI_TEST=mongodb://127.0.0.1:27017 node --test test/meetings.test.js
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MONGODB_URI_TEST = process.env.MONGODB_URI_TEST;
if (!MONGODB_URI_TEST) {
  console.log('[meetings-tests] SKIPPED — set MONGODB_URI_TEST to a MongoDB connection string to run.');
  process.exit(0);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..');
const TEST_DB_URI = `${MONGODB_URI_TEST.replace(/\/$/, '')}/lifeos_test_meetings`;

let server = null; // child process
let baseUrl = '';
let seq = 0;

const uniqueEmail = (prefix) => `${prefix}-${Date.now()}-${seq++}@test.dev`;

// ── Helpers ────────────────────────────────────────────────────────────

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractCookies(res) {
  const headers = res.headers;
  const raw = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  return raw.map((line) => line.split(';')[0]).join('; ');
}

async function boot() {
  const port = 4000 + Math.floor(Math.random() * 900);
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn('node', ['src/index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), MONGODB_URI: TEST_DB_URI, NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await wait(500);
  }
  throw new Error('Server did not become healthy in time');
}

/** Generic HTTP helper with optional cookie + json body. */
async function api(pathname, { method = 'GET', cookie, body, raw } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  let payload;
  if (raw) {
    payload = raw; // FormData etc.
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${pathname}`, { method, headers, body: payload });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-json */
  }
  return { status: res.status, json, res };
}

/** Registers a user (auto-login cookies returned). tenantType personal|organization. */
async function register({ name = 'Alice', email = uniqueEmail('a'), password = 'password123', tenantType = 'personal', organizationName } = {}) {
  const body = { name, email, password, tenantType };
  if (organizationName) body.organizationName = organizationName;
  const { status, json, res } = await api('/api/auth/register', { method: 'POST', body });
  assert.equal(status, 201, `register failed: ${JSON.stringify(json)}`);
  return {
    cookie: extractCookies(res),
    email,
    password,
    data: json.data,
    tenantId: json.data.memberships?.[0]?.tenantId,
  };
}

async function inviteAndJoin(owner, { email, role, permissions }) {
  const invite = await api('/api/tenants/invitations', {
    method: 'POST',
    cookie: owner.cookie,
    body: { email, role, permissions },
  });
  assert.equal(invite.status, 201, `invite failed: ${JSON.stringify(invite.json)}`);
  // The raw invite token only ever travels in the emailed link. The DB stores a
  // SHA-256 hash, so simulate the link by swapping in a hash we know.
  const crypto = await import('node:crypto');
  const rawToken = crypto.randomBytes(24).toString('hex');
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const inv = await mongoose.connection
    .collection('invitations')
    .findOneAndUpdate(
      { email: email.toLowerCase(), status: 'pending' },
      { $set: { tokenHash: hash } },
      { returnDocument: 'after' }
    );
  assert.ok(inv, 'invitation row missing');

  const resolved = await api(`/api/tenants/invitations/resolve?token=${rawToken}`);
  assert.equal(resolved.status, 200, `resolve failed: ${JSON.stringify(resolved.json)}`);

  const member = await register({ name: 'Member', email });
  const accepted = await api('/api/tenants/invitations/accept', {
    method: 'POST',
    cookie: member.cookie,
    body: { token: rawToken },
  });
  assert.equal(accepted.status, 200, `accept failed: ${JSON.stringify(accepted.json)}`);
  return { ...member, rawToken };
}

const itemId = (x) => (x && (x.id || (x._id && x._id.toString()))) || null;

// ── Lifecycle ──────────────────────────────────────────────────────────

before(async () => {
  await mongoose.connect(TEST_DB_URI);
  await mongoose.connection.dropDatabase();
  await boot();
});

after(async () => {
  if (server) server.kill();
  await mongoose.disconnect();
});

const MEETING_PERMS = ['tasks.view', 'schedule.view', 'meetings.view', 'meetings.create', 'meetings.edit', 'meetings.delete'];

async function meId(cookie) {
  const r = await api('/api/auth/me', { cookie });
  assert.equal(r.status, 200);
  return r.json.data.user.id;
}

function payload(overrides = {}) {
  return {
    title: 'Sprint planning',
    type: 'team',
    timezone: 'Africa/Monrovia',
    startAt: '2030-01-15T09:00:00.000Z',
    endAt: '2030-01-15T10:00:00.000Z',
    agenda: '1. Status  2. Blockers',
    participants: [],
    reminders: [15],
    ...overrides,
  };
}

async function orgWithMembers() {
  const owner = await register({ name: 'Org Owner', email: uniqueEmail('mo'), tenantType: 'organization', organizationName: 'Meet Org' });
  const sarah = await inviteAndJoin(owner, { email: uniqueEmail('sarah'), role: 'assistant', permissions: MEETING_PERMS });
  const dave = await inviteAndJoin(owner, { email: uniqueEmail('dave'), role: 'assistant', permissions: MEETING_PERMS });
  return { owner, sarah, dave, sarahId: await meId(sarah.cookie), daveId: await meId(dave.cookie) };
}

test('M1: create links a calendar event; lifecycle start → transcript → end; participant cannot run it', async () => {
  const { owner, sarah, sarahId } = await orgWithMembers();

  const created = await api('/api/meetings', {
    method: 'POST',
    cookie: owner.cookie,
    body: payload({ participants: [{ userId: sarahId, name: 'Sarah' }, { name: 'Guest Gary', email: 'gary@example.com' }] }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const id = itemId(created.json.data);
  assert.ok(created.json.data.calendarEventId, 'meeting must link a calendar event');
  assert.equal(created.json.data.status, 'scheduled');

  // Appears in the existing LifeOS calendar as a meeting event.
  const cal = await api('/api/calendar?from=2030-01-01&to=2030-01-31', { cookie: owner.cookie });
  assert.equal(cal.status, 200);
  const ev = cal.json.data.items.find((e) => String(e.meetingId) === id);
  assert.ok(ev, 'calendar event for meeting missing');
  assert.equal(ev.type, 'meeting');

  // Participant can view but not run/edit.
  const sView = await api(`/api/meetings/${id}`, { cookie: sarah.cookie });
  assert.equal(sView.status, 200);
  assert.equal(sView.json.data.canManage, false);
  assert.equal((await api(`/api/meetings/${id}/start`, { method: 'POST', cookie: sarah.cookie })).status, 403);
  assert.equal((await api(`/api/meetings/${id}`, { method: 'PUT', cookie: sarah.cookie, body: { title: 'hijack' } })).status, 403);

  // Transcript requires a live/completed meeting.
  const early = await api(`/api/meetings/${id}/transcript`, { method: 'POST', cookie: owner.cookie, body: { segments: [{ seq: 0, text: 'too early', startMs: 0 }] } });
  assert.equal(early.status, 409);

  const started = await api(`/api/meetings/${id}/start`, { method: 'POST', cookie: owner.cookie });
  assert.equal(started.status, 200);
  assert.equal(started.json.data.status, 'live');
  // idempotent
  assert.equal((await api(`/api/meetings/${id}/start`, { method: 'POST', cookie: owner.cookie })).json.data.status, 'live');

  const seg = { seq: 0, text: 'Good morning everyone.', startMs: 0, endMs: 2500, speakerLabel: 'Speaker 1' };
  assert.equal((await api(`/api/meetings/${id}/transcript`, { method: 'POST', cookie: owner.cookie, body: { segments: [seg] } })).status, 201);
  // Retrying the same seq must not duplicate.
  await api(`/api/meetings/${id}/transcript`, { method: 'POST', cookie: owner.cookie, body: { segments: [seg, { seq: 1, text: 'Auth is done.', startMs: 3000 }] } });
  const tr = await api(`/api/meetings/${id}/transcript`, { cookie: sarah.cookie });
  assert.equal(tr.status, 200);
  assert.equal(tr.json.data.items.length, 2, 'retry must be idempotent');

  const ended = await api(`/api/meetings/${id}/end`, { method: 'POST', cookie: owner.cookie });
  assert.equal(ended.status, 200);
  assert.equal(ended.json.data.status, 'completed');
  assert.equal(typeof ended.json.data.durationSec, 'number');
});

test('M2: non-participants, other tenants and foreign userIds are locked out', async () => {
  const { owner, sarah, dave, sarahId, daveId } = await orgWithMembers();
  const stranger = await register({ name: 'Eve', email: uniqueEmail('eve') });
  const strangerId = await meId(stranger.cookie);

  const created = await api('/api/meetings', { method: 'POST', cookie: owner.cookie, body: payload({ participants: [{ userId: sarahId, name: 'Sarah' }] }) });
  const id = itemId(created.json.data);

  // Same workspace but not invited → 404 everywhere (no existence leak).
  assert.equal((await api(`/api/meetings/${id}`, { cookie: dave.cookie })).status, 404);
  assert.equal((await api(`/api/meetings/${id}/transcript`, { cookie: dave.cookie })).status, 404);
  assert.equal((await api(`/api/meetings/${id}/action-items`, { cookie: dave.cookie })).status, 404);
  const dList = await api('/api/meetings', { cookie: dave.cookie });
  assert.equal(dList.json.data.items.length, 0);
  const sList = await api('/api/meetings', { cookie: sarah.cookie });
  assert.equal(sList.json.data.items.length, 1);

  // Other tenant → 404.
  assert.equal((await api(`/api/meetings/${id}`, { cookie: stranger.cookie })).status, 404);

  // A userId from another workspace cannot be added as a participant.
  const bad = await api('/api/meetings', { method: 'POST', cookie: owner.cookie, body: payload({ participants: [{ userId: strangerId, name: 'Eve' }] }) });
  assert.equal(bad.status, 400, JSON.stringify(bad.json));
  // …and cannot be smuggled in through an update either.
  const smuggle = await api(`/api/meetings/${id}`, { method: 'PUT', cookie: owner.cookie, body: { participants: [{ userId: strangerId, name: 'Eve' }] } });
  assert.equal(smuggle.status, 400);
  void daveId;
});

test('M3: viewer (meetings.view only) cannot create; validation rejects bad input', async () => {
  const owner = await register({ name: 'Org Owner', email: uniqueEmail('vo'), tenantType: 'organization', organizationName: 'View Org' });
  const viewer = await inviteAndJoin(owner, { email: uniqueEmail('vw'), role: 'viewer', permissions: ['schedule.view', 'meetings.view'] });
  assert.equal((await api('/api/meetings', { method: 'POST', cookie: viewer.cookie, body: payload() })).status, 403);
  assert.equal((await api('/api/meetings', { cookie: viewer.cookie })).status, 200);

  const endBefore = await api('/api/meetings', { method: 'POST', cookie: owner.cookie, body: payload({ endAt: '2030-01-15T08:00:00.000Z' }) });
  assert.equal(endBefore.status, 400);
  const badTz = await api('/api/meetings', { method: 'POST', cookie: owner.cookie, body: payload({ timezone: 'Mars/Base' }) });
  assert.equal(badTz.status, 400);
  const badId = await api('/api/meetings/not-an-id', { cookie: owner.cookie });
  assert.equal(badId.status, 400);
});

test('M4: cancel removes the calendar event; delete cascades transcript/action items/calendar; live cannot be deleted', async () => {
  const owner = await register({ name: 'Solo', email: uniqueEmail('solo') });
  const m = await api('/api/meetings', { method: 'POST', cookie: owner.cookie, body: payload() });
  const id = itemId(m.json.data);

  const cancelled = await api(`/api/meetings/${id}/cancel`, { method: 'POST', cookie: owner.cookie });
  assert.equal(cancelled.json.data.status, 'cancelled');
  const cal = await api('/api/calendar?from=2030-01-01&to=2030-01-31', { cookie: owner.cookie });
  assert.ok(!cal.json.data.items.some((e) => String(e.meetingId) === id), 'cancelled meeting must leave the calendar');
  assert.equal((await api(`/api/meetings/${id}/start`, { method: 'POST', cookie: owner.cookie })).status, 409);

  const m2 = await api('/api/meetings', { method: 'POST', cookie: owner.cookie, body: payload({ title: 'Delete me' }) });
  const id2 = itemId(m2.json.data);
  await api(`/api/meetings/${id2}/start`, { method: 'POST', cookie: owner.cookie });
  assert.equal((await api(`/api/meetings/${id2}`, { method: 'DELETE', cookie: owner.cookie })).status, 409, 'live meeting must not be deletable');
  await api(`/api/meetings/${id2}/transcript`, { method: 'POST', cookie: owner.cookie, body: { segments: [{ seq: 0, text: 'hello', startMs: 0 }] } });
  const ai = await api(`/api/meetings/${id2}/action-items`, { method: 'POST', cookie: owner.cookie, body: { task: 'Complete database design', assigneeName: 'Paul', deadline: '2030-01-18', priority: 'high' } });
  assert.equal(ai.status, 201, JSON.stringify(ai.json));
  await api(`/api/meetings/${id2}/end`, { method: 'POST', cookie: owner.cookie });

  assert.equal((await api(`/api/meetings/${id2}`, { method: 'DELETE', cookie: owner.cookie })).status, 200);
  assert.equal((await api(`/api/meetings/${id2}`, { cookie: owner.cookie })).status, 404);
  const count = await mongoose.connection.collection('transcriptsegments').countDocuments({ meetingId: new mongoose.Types.ObjectId(id2) });
  assert.equal(count, 0, 'transcript must be deleted with the meeting');
  const aiCount = await mongoose.connection.collection('actionitems').countDocuments({ meetingId: new mongoose.Types.ObjectId(id2) });
  assert.equal(aiCount, 0);
});

// ── Phases 5–11: recording, pipeline plumbing, sharing, export, recurrence ─────────

async function putChunk(cookie, meetingId, index, bytes, type = 'audio/webm') {
  const res = await fetch(`${baseUrl}/api/meetings/${meetingId}/recording/chunks/${index}`, {
    method: 'PUT',
    headers: { Cookie: cookie, 'Content-Type': type },
    body: bytes,
  });
  let json = null;
  try { json = await res.json(); } catch { /* */ }
  return { status: res.status, json };
}

test('M5: chunked recording is idempotent, authorised, size/type checked; finalize assembles the file', async () => {
  const { owner, sarah, sarahId } = await orgWithMembers();
  const m = await api('/api/meetings', { method: 'POST', cookie: owner.cookie, body: payload({ participants: [{ userId: sarahId, name: 'Sarah' }] }) });
  const id = itemId(m.json.data);

  // Not live yet → conflict.
  assert.equal((await putChunk(owner.cookie, id, 0, Buffer.from('aaaa'))).status, 409);
  await api(`/api/meetings/${id}/start`, { method: 'POST', cookie: owner.cookie });

  const a = Buffer.from('CHUNK-ZERO-');
  const b = Buffer.from('CHUNK-ONE');
  assert.equal((await putChunk(owner.cookie, id, 0, a)).status, 201);
  const dup = await putChunk(owner.cookie, id, 0, a);
  assert.equal(dup.status, 201);
  assert.equal(dup.json.data.duplicate, true, 'retrying a chunk must not double count');
  assert.equal((await putChunk(owner.cookie, id, 1, b)).status, 201);

  // Participants cannot upload; bad type rejected; empty rejected.
  assert.equal((await putChunk(sarah.cookie, id, 2, b)).status, 403);
  assert.equal((await putChunk(owner.cookie, id, 2, b, 'text/html')).status, 415);
  assert.equal((await putChunk(owner.cookie, id, 2, Buffer.alloc(0))).status, 400);

  const size = (await api(`/api/meetings/${id}`, { cookie: owner.cookie })).json.data.recording.sizeBytes;
  assert.equal(size, a.length + b.length, 'size counted once per chunk');

  const ended = await api(`/api/meetings/${id}/end`, { method: 'POST', cookie: owner.cookie, body: { totalChunks: 2, durationSec: 30 } });
  assert.equal(ended.status, 200);

  // Background job assembles the recording (runner ticks every ~4 s).
  let rec;
  for (let i = 0; i < 20; i += 1) {
    await wait(1000);
    rec = (await api(`/api/meetings/${id}`, { cookie: owner.cookie })).json.data.recording;
    if (rec.status === 'ready') break;
  }
  assert.equal(rec.status, 'ready', 'recording should finalise in the background');
  assert.equal(rec.sizeBytes, a.length + b.length);

  // Signed playback URL streams the assembled bytes (local dev driver) and supports Range.
  const u = await api(`/api/meetings/${id}/recording/url`, { cookie: sarah.cookie });
  assert.equal(u.status, 200);
  const full = await fetch(u.json.data.url);
  assert.equal(Buffer.from(await full.arrayBuffer()).toString(), 'CHUNK-ZERO-CHUNK-ONE');
  const part = await fetch(u.json.data.url, { headers: { Range: 'bytes=0-4' } });
  assert.equal(part.status, 206);
  // A tampered token is refused.
  assert.equal((await fetch(u.json.data.url.replace(/token=./, 'token=x'))).status, 401);
});

test('M6: recurring meetings materialise capped instances; series delete removes only future ones', async () => {
  const owner = await register({ name: 'Recur', email: uniqueEmail('rc') });
  const r = await api('/api/meetings', {
    method: 'POST',
    cookie: owner.cookie,
    body: payload({ recurrence: { frequency: 'daily', interval: 1, until: '2030-01-19T00:00:00.000Z' } }),
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.data.occurrences, 5); // Jan 15–19
  const list = await api('/api/meetings?from=2030-01-01&to=2030-01-31&limit=50', { cookie: owner.cookie });
  assert.equal(list.json.data.items.length, 5);
  const cal = await api('/api/calendar?from=2030-01-01&to=2030-01-31', { cookie: owner.cookie });
  assert.equal(cal.json.data.items.filter((e) => e.type === 'meeting').length, 5);

  const second = [...list.json.data.items].sort((a, b) => a.startAt.localeCompare(b.startAt))[1];
  const del = await api(`/api/meetings/${itemId(second)}?scope=series`, { method: 'DELETE', cookie: owner.cookie });
  assert.equal(del.status, 200);
  assert.equal(del.json.data.deleted, 4);
  const after = await api('/api/meetings?from=2030-01-01&to=2030-01-31', { cookie: owner.cookie });
  assert.equal(after.json.data.items.length, 1, 'first occurrence remains');
});

test('M7: share link is explicit, expiring, revocable, read-only and never exposes audio', async () => {
  const owner = await register({ name: 'Sharer', email: uniqueEmail('sh') });
  const m = await api('/api/meetings', { method: 'POST', cookie: owner.cookie, body: payload() });
  const id = itemId(m.json.data);
  assert.equal((await api(`/api/meetings/${id}/share`, { method: 'POST', cookie: owner.cookie, body: {} })).status, 409, 'only completed meetings');
  await api(`/api/meetings/${id}/start`, { method: 'POST', cookie: owner.cookie });
  await api(`/api/meetings/${id}/transcript`, { method: 'POST', cookie: owner.cookie, body: { segments: [{ seq: 0, text: 'Secret transcript line', startMs: 0 }] } });
  await api(`/api/meetings/${id}/end`, { method: 'POST', cookie: owner.cookie, body: {} });

  const sh = await api(`/api/meetings/${id}/share`, { method: 'POST', cookie: owner.cookie, body: { expiresInDays: 1 } });
  assert.equal(sh.status, 201);
  const token = sh.json.data.token;

  const pub = await api(`/api/public/meetings/${token}`); // no cookie
  assert.equal(pub.status, 200);
  assert.equal(pub.json.data.title, 'Sprint planning');
  assert.equal(pub.json.data.transcript.length, 0, 'transcript excluded unless opted in');
  assert.equal(pub.json.data.recording, undefined);
  assert.equal((await api('/api/public/meetings/not-a-real-token')).status, 404);

  await api(`/api/meetings/${id}/share`, { method: 'DELETE', cookie: owner.cookie });
  assert.equal((await api(`/api/public/meetings/${token}`)).status, 404, 'revoked links stop working');
});

test('M8: exports are authorised, correctly typed and formula-safe; action items become LifeOS tasks', async () => {
  const { owner, dave } = await orgWithMembers();
  const m = await api('/api/meetings', { method: 'POST', cookie: owner.cookie, body: payload({ title: 'Export me' }) });
  const id = itemId(m.json.data);
  await api(`/api/meetings/${id}/start`, { method: 'POST', cookie: owner.cookie });
  const ai = await api(`/api/meetings/${id}/action-items`, { method: 'POST', cookie: owner.cookie, body: { task: '=1+1 evil', assigneeName: 'Paul', deadline: '2030-01-18', priority: 'high' } });
  const itemIdStr = itemId(ai.json.data);

  const csv = await fetch(`${baseUrl}/api/meetings/${id}/export?kind=action-items&format=csv`, { headers: { Cookie: owner.cookie } });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.ok((await csv.text()).includes("\"'=1+1 evil\""), 'formula injection neutralised');

  const pdf = await fetch(`${baseUrl}/api/meetings/${id}/export?kind=minutes&format=pdf`, { headers: { Cookie: owner.cookie } });
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
  assert.equal((await fetch(`${baseUrl}/api/meetings/${id}/export?kind=summary&format=csv`, { headers: { Cookie: owner.cookie } })).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/meetings/${id}/export?kind=minutes&format=pdf`, { headers: { Cookie: dave.cookie } })).status, 404, 'non-participants cannot export');

  // Push to Tasks.
  const t = await api(`/api/meetings/${id}/action-items/${itemIdStr}/task`, { method: 'POST', cookie: owner.cookie });
  assert.equal(t.status, 201, JSON.stringify(t.json));
  assert.ok(t.json.data.taskId, 'action item links to the created task');
  const tasks = await api('/api/tasks?search=evil', { cookie: owner.cookie });
  const task = tasks.json.data.items.find((x) => x.title === '=1+1 evil');
  assert.ok(task, 'task exists in LifeOS Tasks');
  assert.equal(task.priority, 'high');
  // Status stays in sync.
  await api(`/api/meetings/${id}/action-items/${itemIdStr}`, { method: 'PATCH', cookie: owner.cookie, body: { status: 'completed' } });
  const after = await api('/api/tasks?search=evil', { cookie: owner.cookie });
  assert.equal(after.json.data.items.find((x) => x.title === '=1+1 evil').status, 'completed');

  // AI endpoints degrade cleanly when no provider is configured (test env has none).
  const askRes = await api(`/api/meetings/${id}/ask`, { method: 'POST', cookie: owner.cookie, body: { question: 'What was decided?' } });
  assert.equal(askRes.status, 503);
  assert.equal(askRes.json.code, 'AI_NOT_CONFIGURED');
});
