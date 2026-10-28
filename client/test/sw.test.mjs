// node client/test/sw.test.mjs : checks the service worker's routing rules with a fake worker scope.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const listeners = {};
const store = new Map();
const cache = { match: async (r) => store.get(typeof r === 'string' ? r : r.url), put: async (r, v) => store.set(r.url, v), addAll: async () => {} };
const self = { location: { origin: 'https://app.test' }, addEventListener: (t, f) => (listeners[t] = f), clients: { claim: async () => {} }, skipWaiting() {} };
let online = true;
const ctx = vm.createContext({
  self, URL, Response: class { constructor(b, o = {}) { this.ok = true; this.body = b; Object.assign(this, o); } clone() { return this; } static error() { return { err: true }; } },
  caches: { open: async () => cache, match: async (k) => store.get(k) || (k === '/offline.html' ? { offline: true } : undefined), keys: async () => [], delete: async () => true },
  fetch: async (r) => { if (!online) throw new Error('offline'); return { ok: true, url: r.url, clone() { return this; } }; },
});
vm.runInContext(src, ctx);
const run = (url, extra = {}) => {
  let handled = null;
  listeners.fetch({ request: { url, method: 'GET', mode: 'cors', headers: { has: () => false }, ...extra }, respondWith: (p) => (handled = p) });
  return handled;
};
assert.equal(run('https://api.other/api/tasks'), null, 'cross-origin untouched');
assert.equal(run('https://app.test/api/tasks'), null, '/api untouched');
assert.equal(run('https://app.test/sw.js'), null);
assert.equal(run('https://app.test/x.mp4', { headers: { has: (h) => h === 'range' } }), null, 'range requests untouched');
assert.equal(listeners.fetch({ request: { url: 'https://app.test/a', method: 'POST', headers: { has: () => false } }, respondWith: () => assert.fail() }), undefined);
const asset = run('https://app.test/assets/app-abc.js');
assert.ok(asset, 'hashed assets handled');
assert.equal((await asset).ok, true);
online = false;
const nav = await run('https://app.test/tasks', { mode: 'navigate' });
assert.deepEqual(nav, { offline: true }, 'offline navigation shows offline page');
// push: shows an alert when no window is in front, stays quiet when one is; click opens only same-site paths
const shown = [];
ctx.self.registration = { showNotification: async (t, o) => shown.push({ t, o }) };
let wins = [];
ctx.self.clients.matchAll = async () => wins;
const push = async (data) => { let p; listeners.push({ data: { json: () => data }, waitUntil: (x) => (p = x) }); await p; };
await push({ title: 'Anna', body: 'hi', url: 'https://evil.com', tag: 't1', urgent: true });
assert.equal(shown.length, 1);
assert.equal(shown[0].o.data.url, '/', 'external links are neutralised');
assert.equal(shown[0].o.requireInteraction, true);
wins = [{ visibilityState: 'visible', focused: true }];
await push({ title: 'quiet' });
assert.equal(shown.length, 1, 'no duplicate alert while the app is in front');
console.log('service worker rules OK');
