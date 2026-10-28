// Pure helpers for offline mode. No browser APIs here, so they can be unit tested in Node.

/** Edit this list if your API paths differ. Paths are written without the /api prefix. */
export const CONFIG = {
  // First path segment of GET requests whose answers may be kept for offline reading.
  cacheSegments: ['tasks', 'goals', 'notes', 'calendar', 'events', 'nextstep', 'dashboard', 'radar', 'auth'],
  // Only read when the person switches "Connect chats offline" on.
  connectSegments: ['connect'],
  // Never kept, whatever else is configured.
  neverCache: ['billing', 'admin', 'assistant', 'community', 'payments'],
  // Writes that may wait in the queue while there is no signal. Everything else fails with a normal error.
  queueResources: ['tasks', 'notes'],
  // Cached answers are used first (no network) for this long in low-data mode.
  lowDataFreshMs: 5 * 60 * 1000,
  maxQueue: 100,
};

export const TEMP_PREFIX = 'offline-';

/** '/api/tasks/5?x=1' or 'https://host/api/tasks/5' -> 'tasks/5' */
export function normalizePath(url = '', baseURL = '') {
  let p = String(url || '');
  try {
    if (/^https?:\/\//i.test(p)) p = new URL(p).pathname;
    else if (/^https?:\/\//i.test(baseURL) && !p.startsWith('/api')) p = new URL(baseURL).pathname.replace(/\/$/, '') + '/' + p.replace(/^\//, '');
  } catch { /* keep p */ }
  p = p.split('?')[0].split('#')[0];
  p = p.replace(/^\/+/, '').replace(/^api\/+/, '').replace(/\/+$/, '');
  return p;
}

const seg = (path) => path.split('/')[0];

export function isCacheable(path, settings = {}) {
  const s = seg(path);
  if (!s || CONFIG.neverCache.includes(s)) return false;
  if (s === 'auth') return path === 'auth/me';
  if (CONFIG.connectSegments.includes(s)) return !!settings.connectRead;
  return CONFIG.cacheSegments.includes(s);
}

/**
 * Is this a write we may hold back while offline?
 * POST tasks -> create. PATCH/PUT tasks/:id -> update. POST|PATCH|PUT tasks/:id/(complete|toggle|done) -> update.
 */
export function matchQueueable(method, path) {
  const m = String(method || '').toUpperCase();
  const parts = path.split('/');
  const resource = parts[0];
  if (!CONFIG.queueResources.includes(resource)) return null;
  if (m === 'POST' && parts.length === 1) return { resource, kind: 'create', id: null };
  if ((m === 'PATCH' || m === 'PUT') && parts.length === 2) return { resource, kind: 'update', id: parts[1] };
  if (['POST', 'PATCH', 'PUT'].includes(m) && parts.length === 3 && /^(complete|toggle|done)$/.test(parts[2])) {
    return { resource, kind: 'update', id: parts[1], action: parts[2] };
  }
  return null;
}

export const isTempId = (id) => typeof id === 'string' && id.startsWith(TEMP_PREFIX);

function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${k}:${stable(v[k])}`).join(',')}}`;
  return String(v);
}
export const cacheKey = (userId, path, params) => `c|${userId}|${path}|${params && Object.keys(params).length ? stable(params) : ''}`;

export function newKey() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Decide what a failed replay means. */
export function classifyFailure(status, retryAfterHeader) {
  if (!status) return 'retry';                 // still no network
  if (retryAfterHeader) return 'retry';        // server says: busy, try again
  if (status === 401 || status === 408 || status === 425 || status === 429 || status >= 500) return 'retry';
  return 'review';                             // 400, 403, 404, 409, 422 ... needs a person
}

/**
 * Add a new offline write to the queue.
 * - an update to an item that only exists offline is folded into its queued create
 * - a second update to the same item is merged into the first
 * Returns { queue, item, merged }.
 */
export function addToQueue(queue, entry) {
  const q = queue.map((x) => ({ ...x }));
  const body = entry.data && typeof entry.data === 'object' ? entry.data : {};
  if (entry.kind === 'update') {
    const target = q.find((x) => !x.failed && x.resource === entry.resource && (
      (x.kind === 'create' && x.tempId === entry.id) || (x.kind === 'update' && x.id === entry.id && !x.action && !entry.action)
    ));
    if (target) {
      target.data = { ...(target.data || {}), ...body };
      target.at = entry.at;
      return { queue: q, item: target, merged: true };
    }
  }
  q.push(entry);
  return { queue: q, item: entry, merged: false };
}

/** After a create is accepted by the server, later queued items that mention the temporary id get the real one. */
export function rewriteTempId(queue, tempId, realId) {
  return queue.map((x) => (x.id === tempId ? { ...x, id: realId, url: x.url.split(tempId).join(realId) } : x));
}

/** What the server called the new item. Handles { _id }, { id }, { task: { _id } } and { data: ... }. */
export function extractId(envelope) {
  const d = envelope?.data ?? envelope;
  const cand = [d, d?.task, d?.note, d?.item].filter(Boolean);
  for (const c of cand) if (c && (c._id || c.id)) return String(c._id || c.id);
  return null;
}

/**
 * Show waiting changes inside an offline copy of a list so the person sees what they just did.
 * Works on the first array of objects found in the answer ({data:[...]}, {data:{tasks:[...]}}).
 */
export function overlayQueue(envelope, resource, queue) {
  const items = queue.filter((x) => x.resource === resource && !x.failed);
  if (!items.length || !envelope || typeof envelope !== 'object') return envelope;
  const out = JSON.parse(JSON.stringify(envelope));
  const holder = out.data !== undefined ? out : { data: out };
  let list = null; let setList = null;
  const d = holder.data;
  if (Array.isArray(d)) { list = d; setList = (v) => { holder.data = v; }; }
  else if (d && typeof d === 'object') {
    const k = Object.keys(d).find((key) => Array.isArray(d[key]));
    if (k) { list = d[k]; setList = (v) => { d[k] = v; }; }
  }
  if (!list) return envelope;
  let next = list.slice();
  for (const x of items) {
    if (x.kind === 'create') {
      next.unshift({ ...(x.data || {}), _id: x.tempId, id: x.tempId, pendingUpload: true });
    } else {
      next = next.map((row) => {
        const rid = String(row?._id ?? row?.id ?? '');
        if (rid !== x.id) return row;
        const patch = x.action ? { completed: true, status: 'completed', ...(x.data || {}) } : (x.data || {});
        return { ...row, ...patch, pendingUpload: true };
      });
    }
  }
  setList(next);
  return out.data !== undefined ? out : holder.data;
}

export function monthKey(d = new Date()) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; }

export function formatBytes(n) {
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** auto / on / off, plus what the browser says about Data Saver and slow networks. */
export function resolveLowData(mode, conn) {
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return !!(conn && (conn.saveData || ['slow-2g', '2g'].includes(conn.effectiveType)));
}

export function userIdFromAuth(envelope) {
  const d = envelope?.data ?? envelope;
  const u = d?.user ?? d;
  const id = u?._id || u?.id;
  return id ? String(id) : null;
}
