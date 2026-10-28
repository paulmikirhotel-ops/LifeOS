import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePath, isCacheable, matchQueueable, cacheKey, classifyFailure, addToQueue, rewriteTempId,
  extractId, overlayQueue, resolveLowData, userIdFromAuth, formatBytes, newKey, isTempId,
} from '../src/offline/logic.js';

test('normalizePath strips origin, /api, query', () => {
  assert.equal(normalizePath('/api/tasks/5?x=1'), 'tasks/5');
  assert.equal(normalizePath('https://h.example/api/tasks'), 'tasks');
  assert.equal(normalizePath('/tasks/', 'https://h.example/api'), 'tasks');
  assert.equal(normalizePath('tasks'), 'tasks');
});

test('cache rules: allowlist, never-list, auth/me only, connect opt-in', () => {
  assert.equal(isCacheable('tasks', {}), true);
  assert.equal(isCacheable('billing/plan', {}), false);
  assert.equal(isCacheable('admin/x', {}), false);
  assert.equal(isCacheable('community/mentors', {}), false);
  assert.equal(isCacheable('auth/me', {}), true);
  assert.equal(isCacheable('auth/login', {}), false);
  assert.equal(isCacheable('connect/chats', {}), false);
  assert.equal(isCacheable('connect/chats', { connectRead: true }), true);
  assert.equal(isCacheable('unknown/thing', {}), false);
});

test('matchQueueable only for task and note writes', () => {
  assert.deepEqual(matchQueueable('POST', 'tasks'), { resource: 'tasks', kind: 'create', id: null });
  assert.deepEqual(matchQueueable('patch', 'tasks/9'), { resource: 'tasks', kind: 'update', id: '9' });
  assert.equal(matchQueueable('POST', 'tasks/9/complete').kind, 'update');
  assert.equal(matchQueueable('DELETE', 'tasks/9'), null);
  assert.equal(matchQueueable('POST', 'connect/messages'), null);
  assert.equal(matchQueueable('POST', 'community/requests'), null);
  assert.equal(matchQueueable('POST', 'goals'), null);
});

test('cacheKey is stable for param order', () => {
  assert.equal(cacheKey('u', 'tasks', { b: 1, a: 2 }), cacheKey('u', 'tasks', { a: 2, b: 1 }));
  assert.notEqual(cacheKey('u1', 'tasks'), cacheKey('u2', 'tasks'));
});

test('newKey looks like a uuid and differs each time', () => {
  const a = newKey(); const b = newKey();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, b);
});

test('classifyFailure', () => {
  assert.equal(classifyFailure(undefined), 'retry');
  assert.equal(classifyFailure(503), 'retry');
  assert.equal(classifyFailure(401), 'retry');
  assert.equal(classifyFailure(429), 'retry');
  assert.equal(classifyFailure(409, '2'), 'retry');
  assert.equal(classifyFailure(409), 'review');
  assert.equal(classifyFailure(404), 'review');
  assert.equal(classifyFailure(422), 'review');
});

test('an edit to an offline-only task folds into its queued create', () => {
  const create = { key: 'k1', resource: 'tasks', kind: 'create', tempId: 'offline-k1', data: { title: 'A' }, at: 1 };
  assert.ok(isTempId(create.tempId));
  const r = addToQueue([create], { key: 'k2', resource: 'tasks', kind: 'update', id: 'offline-k1', data: { title: 'B', priority: 'high' }, at: 2 });
  assert.equal(r.merged, true);
  assert.equal(r.queue.length, 1);
  assert.deepEqual(r.queue[0].data, { title: 'B', priority: 'high' });
});

test('two edits to the same real task merge; different tasks do not', () => {
  const u1 = { key: 'a', resource: 'tasks', kind: 'update', id: '5', data: { title: 'x' }, at: 1 };
  let r = addToQueue([u1], { key: 'b', resource: 'tasks', kind: 'update', id: '5', data: { notes: 'n' }, at: 2 });
  assert.equal(r.queue.length, 1);
  assert.deepEqual(r.queue[0].data, { title: 'x', notes: 'n' });
  r = addToQueue(r.queue, { key: 'c', resource: 'tasks', kind: 'update', id: '6', data: { title: 'y' }, at: 3 });
  assert.equal(r.queue.length, 2);
});

test('a failed item is never merged into', () => {
  const u1 = { key: 'a', resource: 'tasks', kind: 'update', id: '5', data: { title: 'x' }, failed: { status: 404 }, at: 1 };
  const r = addToQueue([u1], { key: 'b', resource: 'tasks', kind: 'update', id: '5', data: { notes: 'n' }, at: 2 });
  assert.equal(r.queue.length, 2);
});

test('rewriteTempId updates id and url of later items', () => {
  const q = [{ key: 'z', id: 'offline-k1', url: '/tasks/offline-k1/complete' }, { key: 'y', id: '7', url: '/tasks/7' }];
  const out = rewriteTempId(q, 'offline-k1', 'real9');
  assert.equal(out[0].id, 'real9');
  assert.equal(out[0].url, '/tasks/real9/complete');
  assert.equal(out[1].url, '/tasks/7');
});

test('extractId handles common shapes', () => {
  assert.equal(extractId({ _id: 'a' }), 'a');
  assert.equal(extractId({ id: 'b' }), 'b');
  assert.equal(extractId({ task: { _id: 'c' } }), 'c');
  assert.equal(extractId({ success: true, data: { _id: 'd' } }), 'd');
  assert.equal(extractId(null), null);
});

test('overlayQueue adds pending creates and applies pending edits to a cached list', () => {
  const cached = { success: true, data: { tasks: [{ _id: '1', title: 'old' }, { _id: '2', title: 'two' }] } };
  const queue = [
    { resource: 'tasks', kind: 'create', tempId: 'offline-x', data: { title: 'new' } },
    { resource: 'tasks', kind: 'update', id: '1', data: { title: 'edited' } },
    { resource: 'notes', kind: 'create', tempId: 'offline-n', data: { title: 'note' } },
    { resource: 'tasks', kind: 'update', id: '2', action: 'complete', data: {} },
  ];
  const out = overlayQueue(cached, 'tasks', queue);
  assert.equal(out.data.tasks.length, 3);
  assert.equal(out.data.tasks[0].title, 'new');
  assert.equal(out.data.tasks[0].pendingUpload, true);
  assert.equal(out.data.tasks.find((t) => t._id === '1').title, 'edited');
  assert.equal(out.data.tasks.find((t) => t._id === '2').completed, true);
  assert.equal(cached.data.tasks.length, 2, 'input is not mutated');
});

test('overlayQueue works when data is the array itself, and leaves other shapes alone', () => {
  const out = overlayQueue({ data: [{ _id: '1' }] }, 'tasks', [{ resource: 'tasks', kind: 'create', tempId: 'offline-a', data: { title: 't' } }]);
  assert.equal(out.data.length, 2);
  const odd = { data: { count: 3 } };
  assert.deepEqual(overlayQueue(odd, 'tasks', [{ resource: 'tasks', kind: 'create', tempId: 'offline-a', data: {} }]), odd);
});

test('resolveLowData', () => {
  assert.equal(resolveLowData('on', null), true);
  assert.equal(resolveLowData('off', { saveData: true }), false);
  assert.equal(resolveLowData('auto', { saveData: true }), true);
  assert.equal(resolveLowData('auto', { effectiveType: '2g' }), true);
  assert.equal(resolveLowData('auto', { effectiveType: '4g' }), false);
  assert.equal(resolveLowData('auto', null), false);
});

test('userIdFromAuth and formatBytes', () => {
  assert.equal(userIdFromAuth({ data: { user: { _id: 'u1' } } }), 'u1');
  assert.equal(userIdFromAuth({ user: { id: 'u2' } }), 'u2');
  assert.equal(userIdFromAuth({}), null);
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(3 * 1024 * 1024), '3.0 MB');
});
