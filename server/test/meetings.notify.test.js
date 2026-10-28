/**
 * Meeting notifications — API tests (needs MongoDB; uses its own `lifeos_test_notify` database).
 *   MONGODB_URI_TEST=mongodb://127.0.0.1:27017 node --test test/meetings.notify.test.js
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import mongoose from 'mongoose';
import path from 'node:path';
import { remindMeetings, announceMeetingStarts } from '../src/services/scheduler.service.js';
import { fileURLToPath } from 'node:url';

const MONGODB_URI_TEST = process.env.MONGODB_URI_TEST;
if (!MONGODB_URI_TEST) {
  console.log('[notify-tests] SKIPPED — set MONGODB_URI_TEST to a MongoDB connection string to run.');
  process.exit(0);
}

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DB_URI = `${MONGODB_URI_TEST.replace(/\/$/, '')}/lifeos_test_notify`;
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
  startAt: new Date(Date.now() + 20 * 60000).toISOString(),
  endAt: new Date(Date.now() + 110 * 60000).toISOString(),
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


const notes = async (who) => {
  const r = await api('/api/notifications?limit=50', { cookie: who.cookie });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const items = r.json.data?.items || r.json.data?.notifications || r.json.data || [];
  return Array.isArray(items) ? items : [];
};
const titles = (list) => list.map((n) => n.title);
const settle = () => wait(400); // notifications are fire-and-forget

test('N1: reminder uses the spec wording, links to the meeting, carries Join action, and never duplicates', async () => {
  const owner = await register('Paul');
  const m = await createMeeting(owner);
  await remindMeetings(new Date());
  await remindMeetings(new Date()); // second tick must be a no-op
  const mine = (await notes(owner)).filter((n) => n.data?.kind === 'meeting.reminder');
  assert.equal(mine.length, 1, 'exactly one reminder despite two scheduler ticks');
  const n = mine[0];
  assert.match(n.title, /^Your meeting starts in (19|20|21) minutes$/);
  assert.equal(n.priority, 'high');
  assert.equal(n.data.action, 'join');
  assert.equal(n.data.actionLabel, 'Join Meeting');
  assert.equal(n.data.path, `/meetings/${m.id}`);
  assert.equal(n.data.joinPath, `/meetings/${m.id}?join=1`);
  assert.equal(String(n.relatedId), m.id);
});

test('N2: people who join through the link (own workspace) get notified with a link back to the invitation page', async () => {
  const owner = await register('Paul');
  const john = await register('John');
  const m = await createMeeting(owner);
  const t = tokenOf(m.invite);
  assert.equal((await join(t, { password: m.invite.password }, john.cookie)).status, 200);

  await remindMeetings(new Date());
  const r = (await notes(john)).find((n) => n.data?.kind === 'meeting.reminder');
  assert.ok(r, 'link joiner receives the reminder');
  assert.equal(r.data.path, m.invite.path);
  assert.equal(r.data.joinPath, m.invite.path);
  assert.equal(r.data.action, 'join');

  // Guests have no account → nothing to notify and nothing breaks.
  assert.equal((await join(t, { name: 'Mary', password: m.invite.password })).status, 200);
  await remindMeetings(new Date());
});

test('N3: starting the meeting sends "Your meeting has started" with Join to everyone except the starter', async () => {
  const owner = await register('Paul');
  const john = await register('John');
  const m = await createMeeting(owner);
  const t = tokenOf(m.invite);
  await join(t, { password: m.invite.password }, john.cookie);

  assert.equal((await api(`/api/meetings/${m.id}/start`, { method: 'POST', cookie: owner.cookie })).status, 200);
  await settle();
  const j = (await notes(john)).find((n) => n.data?.kind === 'meeting.started');
  assert.ok(j);
  assert.equal(j.title, 'Your meeting has started');
  assert.match(j.message, /Join now/);
  assert.equal(j.data.action, 'join');
  assert.equal(j.data.joinPath, m.invite.path);
  assert.equal((await notes(owner)).filter((n) => n.data?.kind === 'meeting.started').length, 0, 'the starter is not notified');
  // starting twice (idempotent) must not re-notify
  await api(`/api/meetings/${m.id}/start`, { method: 'POST', cookie: owner.cookie });
  await settle();
  assert.equal((await notes(john)).filter((n) => n.data?.kind === 'meeting.started').length, 1);
});

test('N4: start-time announcement fires once for scheduled meetings whose time arrived, and not for live ones', async () => {
  const owner = await register('Paul');
  const past = new Date(Date.now() - 2 * 60000);
  const m = await createMeeting(owner, { startAt: past.toISOString(), endAt: new Date(past.getTime() + 3600000).toISOString() });
  const m2 = await createMeeting(owner, { title: 'Already live', startAt: past.toISOString(), endAt: new Date(past.getTime() + 3600000).toISOString() });
  await api(`/api/meetings/${m2.id}/start`, { method: 'POST', cookie: owner.cookie });
  await announceMeetingStarts(new Date());
  await announceMeetingStarts(new Date());
  const list = (await notes(owner)).filter((n) => n.data?.kind === 'meeting.starting');
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Your meeting is starting now');
  assert.equal(list[0].data.meetingId, m.id);
  assert.equal(list[0].data.action, 'join');
});

test('N5: editing details notifies link joiners; cancelling notifies and offers no Join action', async () => {
  const owner = await register('Paul');
  const john = await register('John');
  const m = await createMeeting(owner);
  await join(tokenOf(m.invite), { password: m.invite.password }, john.cookie);

  const same = await api(`/api/meetings/${m.id}`, { method: 'PUT', cookie: owner.cookie, body: { agenda: 'Project progress\nFinancial update' } });
  assert.equal(same.status, 200);
  await settle();
  assert.equal((await notes(john)).filter((n) => n.data?.kind === 'meeting.updated').length, 0, 'unchanged details → no noise');

  const edit = await api(`/api/meetings/${m.id}`, { method: 'PUT', cookie: owner.cookie, body: { agenda: 'New agenda', location: 'https://meet.example.org/new' } });
  assert.equal(edit.status, 200, JSON.stringify(edit.json));
  await settle();
  const u = (await notes(john)).find((n) => n.data?.kind === 'meeting.updated');
  assert.ok(u);
  assert.equal(u.title, 'The meeting details have been updated');
  assert.match(u.message, /agenda, location/);
  assert.equal(u.data.action, undefined);

  await api(`/api/meetings/${m.id}/cancel`, { method: 'POST', cookie: owner.cookie });
  await settle();
  const c = (await notes(john)).find((n) => n.data?.kind === 'meeting.cancelled');
  assert.ok(c);
  assert.equal(c.data.action, undefined);
});

test('N6: regenerating the link stops notifications to old joiners and removes the password-free return', async () => {
  const owner = await register('Paul');
  const john = await register('John');
  const m = await createMeeting(owner);
  const t1 = tokenOf(m.invite);
  await join(t1, { password: m.invite.password }, john.cookie);
  // Returning signed-in user does not need the password again…
  const back = await join(t1, {}, john.cookie);
  assert.equal(back.status, 200);
  assert.equal((await api(`/api/public/meet/${t1}`, { cookie: john.cookie })).json.data.requiresPassword, false);
  // …but a stranger still does.
  assert.equal((await join(t1, { name: 'Eve' })).json.code, 'PASSWORD_REQUIRED');

  const regen = await api(`/api/meetings/${m.id}/invite/regenerate`, { method: 'POST', cookie: owner.cookie });
  const t2 = tokenOf(regen.json.data);
  await remindMeetings(new Date());
  assert.equal((await notes(john)).filter((n) => n.data?.kind === 'meeting.reminder').length, 0, 'old joiners are not notified after regenerate');
  assert.equal((await api(`/api/public/meet/${t2}`, { cookie: john.cookie })).json.data.requiresPassword, true);
  assert.equal((await join(t2, {}, john.cookie)).json.code, 'PASSWORD_REQUIRED');
  assert.equal((await join(t2, { password: regen.json.data.password }, john.cookie)).status, 200);
});

test('N7: notification preferences still apply (meeting module off → no meeting notifications)', async () => {
  const owner = await register('Paul');
  const john = await register('John');
  const m = await createMeeting(owner);
  await join(tokenOf(m.invite), { password: m.invite.password }, john.cookie);
  const prefs = await api('/api/notifications/preferences', { method: 'PATCH', cookie: john.cookie, body: { modules: { meeting: false } } });
  assert.equal(prefs.status, 200, JSON.stringify(prefs.json));
  await remindMeetings(new Date());
  assert.equal((await notes(john)).filter((n) => n.module === 'meeting' || n.type === 'reminder').length, 0);
});
