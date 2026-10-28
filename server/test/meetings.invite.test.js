/**
 * Meeting invitation link — API tests (needs MongoDB; uses its own `lifeos_test_invite` database).
 *   MONGODB_URI_TEST=mongodb://127.0.0.1:27017 node --test test/meetings.invite.test.js
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MONGODB_URI_TEST = process.env.MONGODB_URI_TEST;
if (!MONGODB_URI_TEST) {
  console.log('[invite-tests] SKIPPED — set MONGODB_URI_TEST to a MongoDB connection string to run.');
  process.exit(0);
}

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DB_URI = `${MONGODB_URI_TEST.replace(/\/$/, '')}/lifeos_test_invite`;
const servers = [];
let baseUrl = '';
let seq = 0;
const uniqueEmail = (p) => `${p}-${Date.now()}-${seq++}@test.dev`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot() {
  const port = 5000 + Math.floor(Math.random() * 900);
  const url = `http://127.0.0.1:${port}`;
  const child = spawn('node', ['src/index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), MONGODB_URI: TEST_DB_URI, NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  servers.push(child);
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) return url;
    } catch {
      /* not up yet */
    }
    await wait(500);
  }
  throw new Error('Server did not become healthy in time');
}

async function api(pathname, { method = 'GET', cookie, body, headers = {} } = {}) {
  const h = { ...headers };
  if (cookie) h.Cookie = cookie;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${pathname}`, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-json */
  }
  return { status: res.status, json, res };
}

const cookiesOf = (res) => (typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []).map((l) => l.split(';')[0]).join('; ');

async function register(name) {
  const email = uniqueEmail(name.toLowerCase());
  const r = await api('/api/auth/register', { method: 'POST', body: { name, email, password: 'password123', tenantType: 'personal' } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return { cookie: cookiesOf(r.res), email };
}

const payload = (o = {}) => ({
  title: 'Community Development Meeting',
  type: 'community',
  timezone: 'Africa/Monrovia',
  startAt: '2030-01-15T16:00:00.000Z',
  endAt: '2030-01-15T17:30:00.000Z',
  agenda: 'Project progress\nFinancial update',
  description: 'Monthly community meeting',
  location: 'https://meet.example.org/room-123',
  reminders: [30],
  ...o,
});

async function createMeeting(owner, overrides) {
  const r = await api('/api/meetings', { method: 'POST', cookie: owner.cookie, body: payload(overrides) });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.data;
}
const tokenOf = (invite) => invite.path.replace('/meet/', '');
const join = (token, body, cookie) => api(`/api/public/meet/${token}/join`, { method: 'POST', body, cookie });

before(async () => {
  await mongoose.connect(TEST_DB_URI);
  await mongoose.connection.dropDatabase();
  baseUrl = await boot();
});
after(async () => {
  servers.forEach((s) => s.kill());
  await mongoose.disconnect();
});

test('I1: a link + password are created with the meeting and never leak through ordinary meeting payloads', async () => {
  const owner = await register('Paul');
  const m = await createMeeting(owner);
  assert.match(m.invite.path, /^\/meet\/[A-Za-z0-9_-]{43}$/);
  assert.match(m.invite.password, /^[A-Z2-9]{8}$/);
  assert.equal(m.invite.accessMode, 'link');
  assert.equal(JSON.stringify(m).includes('tokenHash'), false);
  assert.equal(JSON.stringify(m).includes('passwordHash'), false);

  const got = await api(`/api/meetings/${m.id}`, { cookie: owner.cookie });
  assert.equal(got.json.data.invite, undefined, 'plain meeting GET must not carry invite data');

  const inv = await api(`/api/meetings/${m.id}/invite`, { cookie: owner.cookie });
  assert.equal(inv.status, 200);
  assert.equal(inv.json.data.path, m.invite.path, 'same link every time');
  assert.equal(inv.json.data.password, undefined, 'password is only shown once');
  assert.equal(inv.json.data.hasPassword, true);

  const list = await api('/api/meetings', { cookie: owner.cookie });
  assert.equal(JSON.stringify(list.json).includes('passwordHash'), false);
  assert.equal(JSON.stringify(list.json).includes('tokenHash'), false);
});

test('I2: link-only visitors get a minimal card; bad tokens are plain 404s', async () => {
  const owner = await register('Paul');
  const m = await createMeeting(owner);
  const t = tokenOf(m.invite);
  const r = await api(`/api/public/meet/${t}`);
  assert.equal(r.status, 200);
  const d = r.json.data;
  assert.equal(d.title, 'Community Development Meeting');
  assert.equal(d.organizerName, 'Paul');
  assert.equal(d.phase, 'upcoming');
  assert.equal(d.canJoin, true);
  assert.equal(d.requiresPassword, true);
  for (const secret of ['agenda', 'description', 'location', 'participants', 'notes', 'transcript']) {
    assert.equal(d[secret], undefined, `${secret} must stay hidden until the password is entered`);
  }
  assert.equal((await api('/api/public/meet/not-a-token')).status, 404);
  assert.equal((await api(`/api/public/meet/${'A'.repeat(43)}`)).status, 404);
});

test('I3: password gate, guest name, meeting pass + session, then details are released', async () => {
  const owner = await register('Paul');
  const m = await createMeeting(owner);
  const t = tokenOf(m.invite);

  assert.equal((await join(t, { name: 'Mary' })).json.code, 'PASSWORD_REQUIRED');
  const wrong = await join(t, { name: 'Mary', password: 'WRONGPW1' });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.json.code, 'WRONG_PASSWORD');
  assert.equal((await join(t, { password: m.invite.password })).json.code, 'NAME_REQUIRED');

  const ok = await join(t, { name: 'Mary', password: m.invite.password });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const { pass, participant, meeting } = ok.json.data;
  assert.ok(pass);
  assert.equal(participant.role, 'guest');
  assert.equal(participant.isGuest, true);
  assert.equal(meeting.agenda, 'Project progress\nFinancial update');
  assert.equal(meeting.location, 'https://meet.example.org/room-123');
  assert.equal(meeting.participants, undefined, 'no participant names for visitors');

  assert.equal((await api(`/api/public/meet/${t}/session`)).status, 401);
  const sess = await api(`/api/public/meet/${t}/session`, { headers: { 'X-Meeting-Pass': pass } });
  assert.equal(sess.status, 200);
  assert.equal(sess.json.data.meeting.agenda, meeting.agenda);

  // A pass for one meeting is useless on another.
  const other = await createMeeting(owner, { title: 'Other' });
  assert.equal((await api(`/api/public/meet/${tokenOf(other.invite)}/session`, { headers: { 'X-Meeting-Pass': pass } })).status, 401);
  // …and it is never a login token.
  assert.equal((await api('/api/auth/me', { headers: { Authorization: `Bearer ${pass}` } })).status, 401);
});

test('I4: signed-in users get one participant record however often they join; organizer lists them', async () => {
  const owner = await register('Paul');
  const john = await register('John');
  const m = await createMeeting(owner);
  const t = tokenOf(m.invite);

  const a = await join(t, { password: m.invite.password }, john.cookie);
  const b = await join(t, { password: m.invite.password }, john.cookie);
  assert.equal(a.status, 200, JSON.stringify(a.json));
  assert.equal(b.json.data.participant.id, a.json.data.participant.id, 'same record, no duplicate');
  assert.equal(a.json.data.participant.name, 'John', 'uses the account name, not a typed one');
  assert.equal(a.json.data.participant.role, 'attendee');
  await Promise.all([join(t, { password: m.invite.password }, john.cookie), join(t, { password: m.invite.password }, john.cookie)]);

  const list = await api(`/api/meetings/${m.id}/invite/participants`, { cookie: owner.cookie });
  assert.equal(list.status, 200);
  assert.equal(list.json.data.items.filter((p) => p.name === 'John').length, 1);
  assert.equal(list.json.data.items[0].joinMethod, 'link');

  // The organizer, signed in, needs no password and becomes the chair.
  const org = await join(t, {}, owner.cookie);
  assert.equal(org.status, 200);
  assert.equal(org.json.data.participant.role, 'chair');
  const card = await api(`/api/public/meet/${t}`, { cookie: owner.cookie });
  assert.equal(card.json.data.viewer.isOrganizer, true);
  assert.equal(card.json.data.requiresPassword, false);
});

test('I5: joining through the link never grants access to the workspace meeting itself', async () => {
  const owner = await register('Paul');
  const outsider = await register('Olivia');
  const m = await createMeeting(owner);
  const t = tokenOf(m.invite);
  assert.equal((await join(t, { password: m.invite.password }, outsider.cookie)).status, 200);
  assert.equal((await api(`/api/meetings/${m.id}`, { cookie: outsider.cookie })).status, 404);
  assert.equal((await api(`/api/meetings/${m.id}/invite`, { cookie: outsider.cookie })).status, 404);
  assert.equal((await api(`/api/meetings/${m.id}/invite/participants`, { cookie: outsider.cookie })).status, 404);
});

test('I6: organizer can change the password, disable, and regenerate the link (old link + passes die)', async () => {
  const owner = await register('Paul');
  const m = await createMeeting(owner, { invitePassword: 'Start123' });
  assert.equal(m.invite.password, 'Start123', 'organizer-chosen password is honoured');
  const t1 = tokenOf(m.invite);
  const first = await join(t1, { name: 'Mary', password: 'Start123' });
  assert.equal(first.status, 200);

  const changed = await api(`/api/meetings/${m.id}/invite`, { method: 'PUT', cookie: owner.cookie, body: { password: 'Second22' } });
  assert.equal(changed.status, 200);
  assert.equal(changed.json.data.password, 'Second22');
  assert.equal((await join(t1, { name: 'Xavier', password: 'Start123' })).json.code, 'WRONG_PASSWORD');
  assert.equal((await join(t1, { name: 'Xavier', password: 'Second22' })).status, 200);
  assert.equal((await api(`/api/meetings/${m.id}/invite`, { method: 'PUT', cookie: owner.cookie, body: { password: 'abc' } })).status, 400);

  await api(`/api/meetings/${m.id}/invite`, { method: 'PUT', cookie: owner.cookie, body: { enabled: false } });
  const off = await api(`/api/public/meet/${t1}`);
  assert.equal(off.status, 403);
  assert.equal(off.json.code, 'LINK_DISABLED');
  await api(`/api/meetings/${m.id}/invite`, { method: 'PUT', cookie: owner.cookie, body: { enabled: true } });

  const regen = await api(`/api/meetings/${m.id}/invite/regenerate`, { method: 'POST', cookie: owner.cookie });
  assert.equal(regen.status, 200);
  const t2 = tokenOf(regen.json.data);
  assert.notEqual(t2, t1);
  assert.ok(regen.json.data.password);
  assert.equal((await api(`/api/public/meet/${t1}`)).status, 404, 'old link is dead');
  assert.equal((await join(t1, { name: 'Xavier', password: regen.json.data.password })).status, 404);
  assert.equal((await api(`/api/public/meet/${t2}/session`, { headers: { 'X-Meeting-Pass': first.json.data.pass } })).status, 401, 'old pass is dead');
  assert.equal((await join(t2, { name: 'Mary', password: regen.json.data.password })).status, 200);
});

test('I7: access modes — authenticated needs an account; restricted needs to be a listed participant', async () => {
  const owner = await register('Paul');
  const john = await register('John');
  const m = await createMeeting(owner, { inviteAccessMode: 'authenticated' });
  const t = tokenOf(m.invite);
  const card = await api(`/api/public/meet/${t}`);
  assert.equal(card.json.data.requiresLogin, true);
  const anon = await join(t, { name: 'Mary', password: m.invite.password });
  assert.equal(anon.status, 401);
  assert.equal(anon.json.code, 'LOGIN_REQUIRED');
  assert.equal((await join(t, { password: m.invite.password }, john.cookie)).status, 200);

  await api(`/api/meetings/${m.id}/invite`, { method: 'PUT', cookie: owner.cookie, body: { accessMode: 'restricted' } });
  const denied = await join(t, { password: m.invite.password }, john.cookie);
  assert.equal(denied.status, 403);
  assert.equal(denied.json.code, 'NOT_INVITED');
  assert.equal((await join(t, {}, owner.cookie)).status, 200, 'organizer always allowed');
});

test('I8: cancelled meetings cannot be joined and say so; deleting the meeting kills the link', async () => {
  // Fresh server process = fresh per-IP join rate-limit counters (earlier tests used most of the 20/15min budget).
  baseUrl = await boot();
  const owner = await register('Paul');
  const m = await createMeeting(owner);
  const t = tokenOf(m.invite);
  assert.equal((await join(t, { name: 'Mary', password: m.invite.password })).status, 200);
  assert.equal((await api(`/api/meetings/${m.id}/cancel`, { method: 'POST', cookie: owner.cookie })).status, 200);
  const card = await api(`/api/public/meet/${t}`);
  assert.equal(card.json.data.phase, 'cancelled');
  assert.equal(card.json.data.canJoin, false);
  const j = await join(t, { name: 'Late', password: m.invite.password });
  assert.equal(j.status, 409);
  assert.equal(j.json.code, 'MEETING_CANCELLED');

  assert.equal((await api(`/api/meetings/${m.id}`, { method: 'DELETE', cookie: owner.cookie })).status, 200);
  assert.equal((await api(`/api/public/meet/${t}`)).status, 404);
  assert.equal(await mongoose.connection.collection('meetingparticipants').countDocuments({ meetingId: new mongoose.Types.ObjectId(m.id) }), 0);
});

test('I9: meetings created before links existed get one on first organizer request', async () => {
  const owner = await register('Paul');
  const m = await createMeeting(owner);
  await mongoose.connection.collection('meetings').updateOne({ _id: new mongoose.Types.ObjectId(m.id) }, { $unset: { invite: 1 } });
  const first = await api(`/api/meetings/${m.id}/invite`, { cookie: owner.cookie });
  assert.equal(first.status, 200);
  assert.match(first.json.data.path, /^\/meet\/[A-Za-z0-9_-]{43}$/);
  assert.match(first.json.data.password, /^[A-Z2-9]{8}$/);
  const second = await api(`/api/meetings/${m.id}/invite`, { cookie: owner.cookie });
  assert.equal(second.json.data.path, first.json.data.path);
  assert.equal(second.json.data.password, undefined);
  assert.equal((await join(tokenOf(first.json.data), { name: 'Mary', password: first.json.data.password })).status, 200);
});

test('I10: 8 wrong passwords lock the link — even the right password is refused afterwards', async () => {
  // Fresh server process = fresh per-IP rate-limit counters, so the lockout (not the limiter) is what trips.
  baseUrl = await boot();
  const owner = await register('Paul');
  const m = await createMeeting(owner);
  const t = tokenOf(m.invite);
  for (let i = 0; i < 8; i += 1) {
    const r = await join(t, { name: 'Eve', password: `BAD${i}BAD1` });
    assert.equal(r.json.code, 'WRONG_PASSWORD', `attempt ${i + 1}`);
  }
  const locked = await join(t, { name: 'Eve', password: m.invite.password });
  assert.equal(locked.status, 429);
  assert.equal(locked.json.code, 'LINK_LOCKED');

  // The organizer can reset it by choosing a new password.
  const reset = await api(`/api/meetings/${m.id}/invite`, { method: 'PUT', cookie: owner.cookie, body: { regeneratePassword: true } });
  assert.equal(reset.status, 200);
  assert.equal((await join(t, { name: 'Mary', password: reset.json.data.password })).status, 200);
});
