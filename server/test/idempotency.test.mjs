import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdempotency } from '../src/middleware/idempotency.js';

function fakeModel() {
  const rows = new Map();
  return {
    rows,
    async create(doc) { if (rows.has(doc.key)) { const e = new Error('dup'); e.code = 11000; throw e; } rows.set(doc.key, { ...doc }); },
    findOne(q) { return { lean: async () => (rows.get(q.key) ? { ...rows.get(q.key) } : null) }; },
    async updateOne(q, patch) { Object.assign(rows.get(q.key) || {}, patch); },
    async deleteOne(q) { const r = rows.get(q.key); if (r && (!q.state || r.state === q.state)) rows.delete(q.key); },
  };
}
function mkRes() {
  const handlers = {};
  const res = {
    statusCode: 200, headers: {}, body: undefined,
    set(k, v) { this.headers[k] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    on(ev, fn) { handlers[ev] = fn; },
    close() { handlers.close?.(); },
  };
  return res;
}
const mkReq = (key, method = 'POST', url = '/api/tasks') => ({ method, originalUrl: url, get: (h) => (h.toLowerCase() === 'idempotency-key' ? key : undefined) });
const tick = () => new Promise((r) => setImmediate(r));

test('no header, bad key or GET: passes straight through', async () => {
  const mw = createIdempotency(fakeModel());
  for (const req of [mkReq(undefined), mkReq('short'), mkReq('a'.repeat(20), 'GET')]) {
    let called = false; await mw(req, mkRes(), () => { called = true; });
    assert.equal(called, true);
  }
});

test('first request runs, retry replays the stored answer without running again', async () => {
  const m = fakeModel(); const mw = createIdempotency(m);
  const key = 'abcdefghijklmnop1234';
  let runs = 0;
  const res1 = mkRes();
  await mw(mkReq(key), res1, () => { runs++; res1.status(201).json({ success: true, data: { _id: 't1' } }); });
  await tick();
  const res2 = mkRes();
  await mw(mkReq(key), res2, () => { runs++; });
  assert.equal(runs, 1);
  assert.equal(res2.statusCode, 201);
  assert.deepEqual(res2.body, { success: true, data: { _id: 't1' } });
  assert.equal(res2.headers['Idempotent-Replay'], 'true');
});

test('retry while the first is still running gets 409 with Retry-After', async () => {
  const m = fakeModel(); const mw = createIdempotency(m);
  const key = 'abcdefghijklmnop1234';
  await mw(mkReq(key), mkRes(), () => {});
  const res = mkRes(); let ran = false;
  await mw(mkReq(key), res, () => { ran = true; });
  assert.equal(ran, false);
  assert.equal(res.statusCode, 409);
  assert.equal(res.headers['Retry-After'], '2');
});

test('same key on a different path is refused', async () => {
  const m = fakeModel(); const mw = createIdempotency(m);
  const key = 'abcdefghijklmnop1234';
  const r1 = mkRes();
  await mw(mkReq(key, 'POST', '/api/tasks'), r1, () => r1.status(201).json({ ok: 1 }));
  await tick();
  const r2 = mkRes();
  await mw(mkReq(key, 'POST', '/api/notes'), r2, () => {});
  assert.equal(r2.statusCode, 422);
});

test('a 500 answer is not remembered, so the retry can run', async () => {
  const m = fakeModel(); const mw = createIdempotency(m);
  const key = 'abcdefghijklmnop1234';
  const r1 = mkRes();
  await mw(mkReq(key), r1, () => r1.status(500).json({ success: false }));
  await tick();
  assert.equal(m.rows.has(key), false);
});

test('a dropped connection frees a pending key', async () => {
  const m = fakeModel(); const mw = createIdempotency(m);
  const key = 'abcdefghijklmnop1234';
  const r1 = mkRes();
  await mw(mkReq(key), r1, () => {});
  r1.close(); await tick();
  assert.equal(m.rows.has(key), false);
});

test('database failure does not block the request', async () => {
  const mw = createIdempotency({ create: async () => { throw new Error('db down'); } });
  let called = false;
  await mw(mkReq('abcdefghijklmnop1234'), mkRes(), () => { called = true; });
  assert.equal(called, true);
});
