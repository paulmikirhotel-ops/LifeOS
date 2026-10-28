// Runs the real attach.js against a small stand-in for axios (same interceptor order rules) and a fake server.
import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { attachOffline, flush, getQueue, discardQueued } = await import('../src/offline/attach.js');
const { getState, setState } = await import('../src/offline/status.js');

function makeApi(adapter) {
  const reqI = []; const resI = [];
  const api = {
    interceptors: { request: { use: (f, e) => reqI.push({ f, e }) }, response: { use: (f, e) => resI.push({ f, e }) } },
    async request(c) {
      let cfg = { method: 'get', headers: {}, ...c }; cfg.method = String(cfg.method).toLowerCase(); // real axios does this too
      for (const i of [...reqI].reverse()) cfg = await i.f(cfg);
      let p = (async () => { try { return await (cfg.adapter || adapter)(cfg); } catch (e) { e.config = e.config || cfg; throw e; } })();
      for (const i of resI) p = p.then(i.f, i.e);
      return p;
    },
    get: (url, o) => api.request({ ...o, url, method: 'get' }),
    post: (url, data, o) => api.request({ ...o, url, data, method: 'post' }),
    patch: (url, data, o) => api.request({ ...o, url, data, method: 'patch' }),
  };
  return api;
}

const server = { online: true, tasks: [], seen: new Set(), nextId: 1, forceStatus: null, calls: [] };
function adapter(cfg) {
  if (!server.online) { const e = new Error('Network Error'); e.code = 'ERR_NETWORK'; e.isAxiosError = true; return Promise.reject(e); }
  const path = cfg.url.replace(/^\/api/, '');
  const fail = (status, message, headers = {}) => { const e = new Error('x'); e.isAxiosError = true; e.response = { status, data: { message }, headers }; return Promise.reject(e); };
  const ok = (data, status = 200) => Promise.resolve({ status, data: { success: true, data }, headers: {}, config: cfg });
  if (path === '/auth/me') return ok({ user: { _id: 'user1' } });
  if (cfg.method === 'get' && path === '/tasks') return ok({ tasks: server.tasks.map((t) => ({ ...t })) });
  if (cfg.method === 'post' && path === '/tasks') {
    server.calls.push(cfg);
    if (server.forceStatus) return fail(server.forceStatus, 'nope');
    const key = cfg.headers['Idempotency-Key'];
    if (server.seen.has(key)) return ok(server.tasks.find((t) => t.key === key), 200);
    server.seen.add(key);
    const body = typeof cfg.data === 'string' ? JSON.parse(cfg.data) : cfg.data;
    const t = { _id: `s${server.nextId++}`, key, ...body };
    server.tasks.push(t);
    return ok(t, 201);
  }
  return fail(404, 'not found');
}

const api = makeApi(adapter);
attachOffline(api);
// what the real client.js does afterwards: unwrap { success, data }
api.interceptors.response.use((r) => (r.data && r.data.success !== undefined && 'data' in r.data ? r.data.data : r.data));

test('online: remembers who is signed in and keeps an offline copy of tasks', async () => {
  await api.get('/auth/me');
  server.tasks.push({ _id: 's0', title: 'existing' });
  const list = await api.get('/tasks');
  assert.equal(list.tasks.length, 1);
  assert.equal(getState().online, true);
});

test('offline: lists come from the saved copy and the banner state says so', async () => {
  server.online = false;
  const list = await api.get('/tasks');
  assert.equal(list.tasks.length, 1);
  assert.equal(list.tasks[0].title, 'existing');
  assert.ok(getState().cachedAt);
  assert.equal(getState().online, false);
});

test('offline: a new task is saved on the phone, shows in the list, and edits fold into it', async () => {
  const created = await api.post('/tasks', { title: 'Buy bread' });
  assert.equal(created.pendingUpload, true);
  assert.match(created._id, /^offline-/);
  assert.equal(getState().queued, 1);
  const edited = await api.patch(`/tasks/${created._id}`, { title: 'Buy bread and milk' });
  assert.equal(edited.pendingUpload, true);
  assert.equal(getState().queued, 1, 'folded into the same queued create');
  const list = await api.get('/tasks');
  assert.equal(list.tasks[0].title, 'Buy bread and milk');
  assert.equal(list.tasks[0].pendingUpload, true);
  assert.equal(list.tasks.length, 2);
});

test('offline: things that must not wait still fail normally', async () => {
  await assert.rejects(() => api.post('/community/requests', { to: 'x' }));
  await assert.rejects(() => api.get('/billing/plan'));
});

test('back online: the queue uploads once with the retry key, then empties', async () => {
  server.online = true;
  server.calls.length = 0;
  await flush();
  assert.equal(server.calls.length, 1);
  assert.equal(server.tasks.filter((t) => t.title === 'Buy bread and milk').length, 1);
  assert.equal((await getQueue()).length, 0);
  assert.equal(getState().queued, 0);
  assert.equal(getState().lastSynced, 1);
});

test('a retry of the same key does not create a second task', async () => {
  const key = server.calls[0].headers['Idempotency-Key'];
  const before = server.tasks.length;
  await api.request({ method: 'post', url: '/tasks', data: { title: 'Buy bread and milk' }, headers: { 'Idempotency-Key': key }, __replay: true });
  assert.equal(server.tasks.length, before);
});

test('server says no (422): item is set aside for review, not retried forever', async () => {
  server.online = false;
  await api.post('/tasks', { title: '' });
  server.online = true; server.forceStatus = 422;
  await flush();
  const q = await getQueue();
  assert.equal(q.length, 1);
  assert.equal(q[0].failed.status, 422);
  assert.equal(getState().failed, 1);
  assert.equal(getState().queued, 0);
  await discardQueued(q[0].key);
  assert.equal((await getQueue()).length, 0);
  server.forceStatus = null;
});

test('server down (503): item stays queued for later', async () => {
  server.online = false;
  await api.post('/tasks', { title: 'later' });
  server.online = true; server.forceStatus = 503;
  await flush();
  const q = await getQueue();
  assert.equal(q.length, 1);
  assert.equal(q[0].failed, null);
  assert.equal(q[0].attempts, 1);
  server.forceStatus = null;
  await flush();
  assert.equal((await getQueue()).length, 0);
});

test('signing out wipes the copies and queue; a different person never sees them', async () => {
  server.online = true;
  server.forceStatus = null;
  await api.get('/tasks');
  server.online = false;
  await api.post('/tasks', { title: 'mine' });
  server.online = true;
  const { wipeAll } = await import('../src/offline/attach.js');
  await wipeAll();
  setState({ queued: 0 });
  assert.equal((await getQueue()).length, 0);
  server.online = false;
  await assert.rejects(() => api.get('/tasks'));
});
