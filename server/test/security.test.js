/**
 * LifeOS security test suite — PROVES the tenant-isolation boundary (Phase 13).
 *
 * Run:
 *   $env:MONGODB_URI_TEST='mongodb://127.0.0.1:27017' ; npm test   (PowerShell)
 *   MONGODB_URI_TEST=mongodb://127.0.0.1:27017 npm test            (bash)
 *
 * The suite boots a real server on a random port against a dedicated
 * `lifeos_test` database and drives it over HTTP (fetch + cookies),
 * exactly like an attacker with Postman would.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MONGODB_URI_TEST = process.env.MONGODB_URI_TEST;
if (!MONGODB_URI_TEST) {
  console.log('[security-tests] SKIPPED — set MONGODB_URI_TEST to a MongoDB connection string to run.');
  process.exit(0);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..');
const TEST_DB_URI = `${MONGODB_URI_TEST.replace(/\/$/, '')}/lifeos_test`;

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

// ── T1: Tenant isolation ───────────────────────────────────────────────

test('T1: tenant A data is invisible to tenant B (tasks, journal, finance, habits, goals)', async () => {
  const a = await register({ name: 'Alice', email: uniqueEmail('a') });
  const b = await register({ name: 'Bob', email: uniqueEmail('b') });
  assert.notEqual(a.tenantId, b.tenantId);

  // Task created by A
  const task = await api('/api/tasks', { method: 'POST', cookie: a.cookie, body: { title: "A's secret task" } });
  assert.equal(task.status, 201, JSON.stringify(task.json));
  const taskId = itemId(task.json.data);
  // B cannot list it
  const bList = await api('/api/tasks', { cookie: b.cookie });
  assert.equal(bList.status, 200);
  assert.equal(bList.json.data.items.length, 0);
  // B cannot read it (404, not 403)
  const bRead = await api(`/api/tasks/${taskId}`, { cookie: b.cookie });
  assert.equal(bRead.status, 404, 'cross-tenant read must 404');

  // Journal note (private by default)
  const note = await api('/api/journal', {
    method: 'POST',
    cookie: a.cookie,
    body: { title: 'A private thought', content: 'very secret', isPrivate: true },
  });
  assert.equal(note.status, 201, JSON.stringify(note.json));
  const noteId = itemId(note.json.data);
  const bNote = await api(`/api/journal/${noteId}`, { cookie: b.cookie });
  assert.equal(bNote.status, 404);

  // Expense
  const expense = await api('/api/finance/expenses', {
    method: 'POST',
    cookie: a.cookie,
    body: { amount: 150, category: 'Transport', date: '2026-09-01' },
  });
  assert.equal(expense.status, 201, JSON.stringify(expense.json));
  const expenseId = itemId(expense.json.data);
  const bExp = await api('/api/finance/expenses', { cookie: b.cookie });
  assert.equal(bExp.json.data.items.length, 0);
  const bExpRead = await api(`/api/finance/expenses/${expenseId}`, { cookie: b.cookie });
  assert.equal(bExpRead.status, 404);

  // Habit
  const habit = await api('/api/habits', { method: 'POST', cookie: a.cookie, body: { name: 'Read' } });
  assert.equal(habit.status, 201, JSON.stringify(habit.json));
  const bHabits = await api('/api/habits', { cookie: b.cookie });
  assert.equal(bHabits.json.data.items.length, 0);

  // Goal
  const goal = await api('/api/goals', { method: 'POST', cookie: a.cookie, body: { title: 'Learn Rust' } });
  assert.equal(goal.status, 201, JSON.stringify(goal.json));
  const goalId = itemId(goal.json.data);
  const bGoal = await api(`/api/goals/${goalId}`, { cookie: b.cookie });
  assert.equal(bGoal.status, 404);
});

// ── T2: Authorization bypass (tenantId / userId tampering) ─────────────

test('T2: tampering with tenantId/userId in the body grants nothing', async () => {
  const a = await register({ name: 'Alice', email: uniqueEmail('a') });
  const b = await register({ name: 'Bob', email: uniqueEmail('b') });

  // A tries to create a task inside B's tenant via body tenantId
  const tampered = await api('/api/tasks', {
    method: 'POST',
    cookie: a.cookie,
    body: { title: 'Hijack attempt', tenantId: b.tenantId },
  });
  assert.equal(tampered.status, 201, JSON.stringify(tampered.json));
  const bList = await api('/api/tasks', { cookie: b.cookie });
  assert.equal(bList.json.data.items.length, 0, 'task must NOT land in tenant B');

  // PATCH with tenantId in body cannot move the document
  const aList = await api('/api/tasks', { cookie: a.cookie });
  const myTask = aList.json.data.items[0];
  const patch = await api(`/api/tasks/${itemId(myTask)}`, {
    method: 'PATCH',
    cookie: a.cookie,
    body: { title: 'still mine', tenantId: b.tenantId },
  });
  assert.equal(patch.status, 200, JSON.stringify(patch.json));
  assert.equal(patch.json.data.tenantId, a.tenantId, 'tenantId must come from the session, not the body');

  // userId / authorId tampering on a private journal note
  const note = await api('/api/journal', {
    method: 'POST',
    cookie: a.cookie,
    body: { title: 'private', content: 'x', isPrivate: true },
  });
  const noteId = itemId(note.json.data);
  const tamperedAuthor = await api(`/api/journal/${noteId}`, {
    method: 'PATCH',
    cookie: a.cookie,
    body: { authorId: b.tenantId, content: 'edited' },
  });
  assert.equal(tamperedAuthor.status, 200);
  // Author must remain A — re-read as B to confirm no leak
  const bRead = await api(`/api/journal/${noteId}`, { cookie: b.cookie });
  assert.equal(bRead.status, 404);

  // Expense with forged tenantId
  const exp = await api('/api/finance/expenses', {
    method: 'POST',
    cookie: a.cookie,
    body: { amount: 50, category: 'Food', date: '2026-09-01', tenantId: b.tenantId },
  });
  assert.equal(exp.status, 201);
  const bExp = await api('/api/finance/expenses', { cookie: b.cookie });
  assert.equal(bExp.json.data.items.length, 0);
});

// ── T3: Permission isolation (role matrix in an organization) ──────────

test('T3: finance_manager and viewer cannot cross their permission boundaries', async () => {
  const owner = await register({
    name: 'Org Owner',
    email: uniqueEmail('o'),
    tenantType: 'organization',
    organizationName: 'Acme Org',
  });

  const fmEmail = uniqueEmail('fm');
  const fm = await inviteAndJoin(owner, {
    email: fmEmail,
    role: 'finance_manager',
    permissions: [
      'finance.view',
      'finance.create',
      'finance.edit',
      'finance.delete',
      'finance.reports',
      'users.view',
      'analytics.view',
    ],
  });

  // finance_manager: finance OK, journal/tasks/settings denied
  const fmJournal = await api('/api/journal', { cookie: fm.cookie });
  assert.equal(fmJournal.status, 403, 'finance_manager must not read journal');
  const fmJournalCreate = await api('/api/journal', { method: 'POST', cookie: fm.cookie, body: { title: 'x', content: 'y' } });
  assert.equal(fmJournalCreate.status, 403);
  const fmTasks = await api('/api/tasks', { cookie: fm.cookie });
  assert.equal(fmTasks.status, 403, 'finance_manager lacks tasks.view');
  const fmExpense = await api('/api/finance/expenses', {
    method: 'POST',
    cookie: fm.cookie,
    body: { amount: 12.5, category: 'Food', date: '2026-09-01' },
  });
  assert.equal(fmExpense.status, 201, `fm expense failed: ${JSON.stringify(fmExpense.json)}`);
  const fmSettings = await api('/api/tenants/settings', { method: 'PATCH', cookie: fm.cookie, body: { currency: 'EUR' } });
  assert.equal(fmSettings.status, 403, 'finance_manager must not manage settings');

  // viewer: read-only
  const viewer = await inviteAndJoin(owner, {
    email: uniqueEmail('v'),
    role: 'viewer',
    permissions: ['tasks.view', 'schedule.view', 'finance.view'],
  });
  const vTasks = await api('/api/tasks', { cookie: viewer.cookie });
  assert.equal(vTasks.status, 200);
  const vCreate = await api('/api/tasks', { method: 'POST', cookie: viewer.cookie, body: { title: 'nope' } });
  assert.equal(vCreate.status, 403, 'viewer must not create tasks');
});

// ── T4: Private journal gating with journal.view only ──────────────────

test('T4: journal.view does not expose private notes; journal.create still required to write', async () => {
  const owner = await register({
    name: 'Org Owner 2',
    email: uniqueEmail('o2'),
    tenantType: 'organization',
    organizationName: 'Beta Org',
  });
  const reader = await inviteAndJoin(owner, {
    email: uniqueEmail('r'),
    role: 'viewer',
    permissions: ['journal.view', 'finance.view'],
  });

  const privateNote = await api('/api/journal', {
    method: 'POST',
    cookie: owner.cookie,
    body: { title: 'hidden', content: 'sensitive', isPrivate: true },
  });
  const privateId = itemId(privateNote.json.data);
  const sharedNote = await api('/api/journal', {
    method: 'POST',
    cookie: owner.cookie,
    body: { title: 'shared', content: 'hello team', isPrivate: false },
  });
  const sharedId = itemId(sharedNote.json.data);

  const list = await api('/api/journal', { cookie: reader.cookie });
  assert.equal(list.status, 200);
  const ids = list.json.data.items.map(itemId);
  assert.ok(!ids.includes(privateId), 'private note leaked into the shared list');
  assert.ok(ids.includes(sharedId), 'shared note should be visible');

  const directPrivate = await api(`/api/journal/${privateId}`, { cookie: reader.cookie });
  assert.equal(directPrivate.status, 404, 'private note must 404 without journal.private');
  const directShared = await api(`/api/journal/${sharedId}`, { cookie: reader.cookie });
  assert.equal(directShared.status, 200);

  const writeAttempt = await api('/api/journal', {
    method: 'POST',
    cookie: reader.cookie,
    body: { title: 'intrusion', content: 'x' },
  });
  assert.equal(writeAttempt.status, 403, 'journal.view does not grant journal.create');
});

// ── T5: Platform admin has no tenant data access ───────────────────────

test('T5: platform-admin sees aggregates only — tenant routes return 403', async () => {
  const admin = await register({ name: 'Sudo', email: uniqueEmail('adm') });
  await mongoose.connection
    .collection('users')
    .updateOne({ email: admin.email }, { $set: { role: 'platform-admin' } });

  const stats = await api('/api/admin/stats', { cookie: admin.cookie });
  assert.equal(stats.status, 200, JSON.stringify(stats.json));
  assert.equal(typeof stats.json.data.users, 'number');

  const tenantDataRoutes = ['/api/tasks', '/api/journal', '/api/finance/expenses', '/api/goals', '/api/habits'];
  for (const route of tenantDataRoutes) {
    const res = await api(route, { cookie: admin.cookie });
    assert.equal(res.status, 403, `admin must be blocked from ${route} (got ${res.status})`);
  }
});

// ── T6: Audit log immutability ─────────────────────────────────────────

test('T6: finance mutations are audited and the audit trail is read-only', async () => {
  const owner = await register({ name: 'Auditor', email: uniqueEmail('aud') });
  const expense = await api('/api/finance/expenses', {
    method: 'POST',
    cookie: owner.cookie,
    body: { amount: 150, category: 'Transportation', date: '2026-09-01', description: 'taxi' },
  });
  assert.equal(expense.status, 201, JSON.stringify(expense.json));

  const audit = await api('/api/finance/audit', { cookie: owner.cookie });
  assert.equal(audit.status, 200);
  const entry = audit.json.data.items.find((e) => e.action === 'CREATE_EXPENSE');
  assert.ok(entry, 'CREATE_EXPENSE audit entry missing');
  assert.equal(entry.details.amount, 150);

  // No mutation endpoints exist → 404 for any write attempt
  const patchAudit = await api('/api/finance/audit/whatever', { method: 'PATCH', cookie: owner.cookie, body: {} });
  assert.equal(patchAudit.status, 404);
  const deleteAudit = await api('/api/finance/audit/whatever', { method: 'DELETE', cookie: owner.cookie });
  assert.equal(deleteAudit.status, 404);
  const createAudit = await api('/api/finance/audit', { method: 'POST', cookie: owner.cookie, body: {} });
  assert.equal(createAudit.status, 404);
});

// ── T7: Evidence files are tenant-scoped ───────────────────────────────

test('T7: uploaded evidence cannot be downloaded cross-tenant', async () => {
  const a = await register({ name: 'Alice', email: uniqueEmail('a') });
  const b = await register({ name: 'Bob', email: uniqueEmail('b') });
  const expense = await api('/api/finance/expenses', {
    method: 'POST',
    cookie: a.cookie,
    body: { amount: 99, category: 'Rent', date: '2026-09-01' },
  });
  const expenseId = itemId(expense.json.data);

  const form = new FormData();
  form.append('recordType', 'expense');
  form.append('recordId', expenseId);
  form.append('file', new Blob(['fake-receipt-content'], { type: 'image/png' }), 'receipt.png');
  const uploaded = await api('/api/finance/evidence/upload', { method: 'POST', cookie: a.cookie, raw: form });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.json));
  const storedName = uploaded.json.data.attachments[0].storedName;
  assert.ok(storedName);

  const ownDownload = await api(`/api/finance/evidence/${storedName}`, { cookie: a.cookie });
  assert.equal(ownDownload.status, 200);
  const foreignDownload = await api(`/api/finance/evidence/${storedName}`, { cookie: b.cookie });
  assert.equal(foreignDownload.status, 404, 'cross-tenant evidence download must fail');
});
