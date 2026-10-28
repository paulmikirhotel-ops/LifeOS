// Connects offline mode to the axios client. Call attachOffline(api) right after axios.create(...)
// and BEFORE the client's own interceptors, so what we hand back flows through them like a normal answer.
import {
  CONFIG, normalizePath, isCacheable, matchQueueable, cacheKey, newKey, classifyFailure,
  addToQueue, rewriteTempId, extractId, overlayQueue, isTempId, TEMP_PREFIX, userIdFromAuth,
} from './logic.js';
import { kvGet, kvSet, kvDel, kvClear } from './store.js';
import { getState, setState, getUserId, setUserId, isLowData, addUsage } from './status.js';

const queueKey = (u) => `q|${u}`;
let apiRef = null;
let flushing = false;
let timer = null;

const readQueue = async (u) => (u ? (await kvGet(queueKey(u))) || [] : []);
async function writeQueue(u, q) {
  if (!u) return;
  await kvSet(queueKey(u), q);
  setState({ queued: q.filter((x) => !x.failed).length, failed: q.filter((x) => x.failed).length });
}

export async function getQueue() { return readQueue(getUserId()); }
export async function discardQueued(id) {
  const u = getUserId();
  await writeQueue(u, (await readQueue(u)).filter((x) => x.id !== id && x.key !== id));
}
export async function retryFailed(key) {
  const u = getUserId();
  await writeQueue(u, (await readQueue(u)).map((x) => (x.key === key ? { ...x, failed: null } : x)));
  flush();
}
export async function clearOfflineCopies() {
  const u = getUserId();
  await kvClear(`c|${u}|`);
  setState({ cachedAt: null });
}
/** Sign-out or a different person signing in: remove everything kept for the previous person. */
export async function wipeAll() {
  await kvClear('');
  setState({ queued: 0, failed: 0, cachedAt: null });
}

function offlineError(cfg) {
  const e = new Error('Network unavailable (offline copy)');
  e.code = 'ERR_NETWORK';
  e.isAxiosError = true;
  e.config = cfg;
  return e;
}

function fakeResponse(cfg, body, extra = {}) {
  return { data: body, status: 200, statusText: 'OK (offline)', headers: {}, config: cfg, request: null, ...extra };
}

export function attachOffline(api) {
  apiRef = api;

  api.interceptors.request.use(async (cfg) => {
    const path = normalizePath(cfg.url, cfg.baseURL);
    const method = (cfg.method || 'get').toLowerCase();
    const q = matchQueueable(method, path);
    if (q && !cfg.__replay) {
      cfg.headers = cfg.headers || {};
      const key = cfg.__idemKey || newKey();
      cfg.__idemKey = key;
      if (typeof cfg.headers.set === 'function') cfg.headers.set('Idempotency-Key', key); else cfg.headers['Idempotency-Key'] = key;
      // An item that only exists on this phone cannot be sent: go straight to the offline path.
      if (isTempId(q.id)) cfg.adapter = () => Promise.reject(offlineError(cfg));
    }
    // Low-data mode: reuse a recent offline copy instead of asking the server again.
    const st = getState().settings;
    if (method === 'get' && !cfg.__replay && !cfg.__fresh && st.offlineCopies && isLowData() && isCacheable(path, st)) {
      const u = getUserId();
      const hit = u ? await kvGet(cacheKey(u, path, cfg.params)) : null;
      if (hit && Date.now() - hit.at < CONFIG.lowDataFreshMs) {
        const queue = await readQueue(u);
        const data = overlayQueue(hit.data, path.split('/')[0], queue);
        cfg.adapter = () => Promise.resolve(fakeResponse(cfg, data, { fromLowData: true }));
      }
    }
    return cfg;
  });

  api.interceptors.response.use(
    async (res) => {
      const cfg = res.config || {};
      const path = normalizePath(cfg.url, cfg.baseURL);
      const method = (cfg.method || 'get').toLowerCase();
      if (res.fromLowData) return res; // came from the phone, not the network: say nothing, count nothing
      setState({ online: true, cachedAt: null });
      try {
        addUsage(typeof res.data === 'string' ? res.data.length : JSON.stringify(res.data ?? '').length);
        if (path === 'auth/login' || path === 'auth/me' || path === 'auth/register') {
          const id = userIdFromAuth(res.data);
          const prev = getUserId();
          if (id && prev && prev !== id) await wipeAll();
          if (id) { setUserId(id); if (!prev || prev !== id) loadCounts(); }
        }
        if (path === 'auth/logout') { await wipeAll(); setUserId(''); }
        const st = getState().settings;
        if (method === 'get' && st.offlineCopies && res.status >= 200 && res.status < 300 && isCacheable(path, st)) {
          const u = getUserId();
          if (u) kvSet(cacheKey(u, path, cfg.params), { at: Date.now(), data: res.data });
        }
      } catch { /* offline bookkeeping must never break a real answer */ }
      return res;
    },
    async (error) => {
      const cfg = error?.config;
      if (!cfg || cfg.__replay || error.response || error.code === 'ERR_CANCELED') return Promise.reject(error);
      const u = getUserId();
      if (!u) return Promise.reject(error);
      setState({ online: false });
      const path = normalizePath(cfg.url, cfg.baseURL);
      const method = (cfg.method || 'get').toLowerCase();
      const st = getState().settings;

      if (method === 'get' && st.offlineCopies && isCacheable(path, st)) {
        const hit = await kvGet(cacheKey(u, path, cfg.params));
        if (hit) {
          const queue = await readQueue(u);
          const data = overlayQueue(hit.data, path.split('/')[0], queue);
          setState({ cachedAt: hit.at });
          return fakeResponse(cfg, data, { fromOffline: true, cachedAt: hit.at });
        }
        return Promise.reject(error);
      }

      const q = matchQueueable(method, path);
      if (q) {
        let queue = await readQueue(u);
        if (queue.filter((x) => !x.failed).length >= CONFIG.maxQueue) return Promise.reject(error);
        let payload = cfg.data;
        if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch { payload = {}; } }
        const key = cfg.__idemKey || newKey();
        const entry = {
          key, resource: q.resource, kind: q.kind, id: q.id, action: q.action || null,
          tempId: q.kind === 'create' ? `${TEMP_PREFIX}${key}` : null,
          method: method.toUpperCase(), url: cfg.url, params: cfg.params || null, data: payload || {},
          at: Date.now(), attempts: 0, failed: null,
        };
        const res = addToQueue(queue, entry);
        queue = res.queue;
        await writeQueue(u, queue);
        const item = res.item;
        const row = item.kind === 'create'
          ? { ...(item.data || {}), _id: item.tempId, id: item.tempId, pendingUpload: true, createdAt: new Date(item.at).toISOString() }
          : { ...(item.data || {}), _id: item.id, id: item.id, pendingUpload: true };
        scheduleFlush();
        return fakeResponse(cfg, { success: true, data: row, offlineQueued: true }, { status: 202, statusText: 'Saved on this phone', fromOffline: true });
      }
      return Promise.reject(error);
    },
  );

  loadCounts();
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { setState({ online: true }); flush(); });
    window.addEventListener('focus', () => { if (getState().queued) flush(); });
  }
  scheduleFlush(2000);
  return api;
}

async function loadCounts() {
  const q = await readQueue(getUserId());
  setState({ queued: q.filter((x) => !x.failed).length, failed: q.filter((x) => x.failed).length });
}

function scheduleFlush(ms = 20000) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    timer = null;
    await flush();
    const q = await readQueue(getUserId());
    if (q.some((x) => !x.failed)) scheduleFlush(30000);
  }, ms);
}

/** Send waiting changes, oldest first. Stops at the first "no network"; sets aside changes the server rejects. */
export async function flush() {
  if (flushing || !apiRef) return;
  const u = getUserId();
  if (!u) return;
  flushing = true;
  setState({ flushing: true });
  let synced = 0;
  try {
    for (;;) {
      let queue = await readQueue(u);
      const item = queue.find((x) => !x.failed);
      if (!item) break;
      try {
        const res = await apiRef.request({
          method: item.method, url: item.url, params: item.params || undefined, data: item.data,
          headers: { 'Idempotency-Key': item.key }, __replay: true,
        });
        queue = (await readQueue(u)).filter((x) => x.key !== item.key);
        if (item.kind === 'create') {
          const realId = extractId(res?.data ?? res) || extractId(res);
          if (realId) queue = rewriteTempId(queue, item.tempId, realId);
        }
        await writeQueue(u, queue);
        synced += 1;
        setState({ online: true });
      } catch (err) {
        const status = err?.response?.status;
        const verdict = classifyFailure(status, err?.response?.headers?.['retry-after']);
        if (verdict === 'retry') {
          if (!status) setState({ online: false });
          const cur = await readQueue(u);
          await writeQueue(u, cur.map((x) => (x.key === item.key ? { ...x, attempts: (x.attempts || 0) + 1 } : x)));
          break;
        }
        const msg = err?.response?.data?.message || `The server said no (${status}).`;
        const cur = await readQueue(u);
        await writeQueue(u, cur.map((x) => (x.key === item.key ? { ...x, failed: { status, message: String(msg).slice(0, 200) } } : x)));
      }
    }
  } finally {
    flushing = false;
    setState({ flushing: false, ...(synced ? { lastSyncAt: Date.now(), lastSynced: synced } : {}) });
    if (synced && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('lifeos:synced', { detail: { count: synced } }));
  }
}
