import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { cacheResponse, invalidateOnWrite, clearAll, stats } from '../src/utils/cache.js';

function makeApp() {
  const calls = { n: 0 };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const id = req.get('x-user');
    if (id) req.user = { id, tenantId: 't1' };
    next();
  });
  app.use(invalidateOnWrite);
  app.get('/data', cacheResponse(30), async (req, res) => {
    calls.n += 1;
    await new Promise((r) => setTimeout(r, 30));
    res.json({ success: true, data: { owner: req.user.id, n: calls.n } });
  });
  app.get('/fail', cacheResponse(30), (_req, res) => res.status(500).json({ success: false }));
  app.post('/data', (_req, res) => res.json({ success: true }));
  return { app, calls };
}
async function withServer(app, fn) {
  const s = app.listen(0);
  const base = `http://127.0.0.1:${s.address().port}`;
  try { await fn(base); } finally { s.close(); }
}
const get = (base, p, user) => fetch(base + p, { headers: { 'x-user': user } });

test('hit after miss, per-user isolation, invalidation on write', async () => {
  clearAll();
  const { app, calls } = makeApp();
  await withServer(app, async (b) => {
    const a1 = await get(b, '/data?x=1', 'alice');
    assert.equal(a1.headers.get('x-cache'), 'MISS');
    const a2 = await get(b, '/data?x=1', 'alice');
    assert.equal(a2.headers.get('x-cache'), 'HIT');
    assert.equal(calls.n, 1);
    const bob = await (await get(b, '/data?x=1', 'bob')).json();
    assert.equal(bob.data.owner, 'bob'); // never alice's data
    assert.equal(calls.n, 2);
    await get(b, '/data?x=2', 'alice'); // different query = different key
    assert.equal(calls.n, 3);
    await fetch(b + '/data', { method: 'POST', headers: { 'x-user': 'alice' } });
    const a3 = await get(b, '/data?x=1', 'alice');
    assert.equal(a3.headers.get('x-cache'), 'MISS'); // alice's write cleared her cache
    const b2 = await get(b, '/data?x=1', 'bob');
    assert.equal(b2.headers.get('x-cache'), 'HIT'); // bob's cache untouched
  });
});

test('stampede: concurrent identical requests hit the database once', async () => {
  clearAll();
  const { app, calls } = makeApp();
  await withServer(app, async (b) => {
    const rs = await Promise.all(Array.from({ length: 20 }, () => get(b, '/data', 'carol')));
    assert.ok(rs.every((r) => r.status === 200));
    assert.equal(calls.n, 1);
  });
});

test('errors are not cached; anonymous requests bypass the cache', async () => {
  clearAll();
  const { app } = makeApp();
  await withServer(app, async (b) => {
    assert.equal((await get(b, '/fail', 'dan')).status, 500);
    assert.equal((await get(b, '/fail', 'dan')).headers.get('x-cache'), 'MISS');
    const anon = await fetch(b + '/fail');
    assert.equal(anon.headers.get('x-cache'), null);
  });
  assert.ok(stats.hits >= 1);
});
