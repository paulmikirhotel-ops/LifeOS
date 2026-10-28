/**
 * Small in-memory cache for read-heavy API responses (cache-aside).
 *
 * - Every key starts with "u:<userId>:t:<tenantId>:" so one user can never be served
 *   another user's data, and one call can drop all of a user's entries at once.
 * - Entries expire by TTL and are cleared whenever that user changes something (see invalidateOnWrite).
 * - Memory is capped; the oldest entries are dropped first.
 * - Any cache failure falls through to the normal handler (MongoDB), never to an error.
 *
 * Single-server only. If you ever run several servers, swap the store for Redis.
 */
const MAX_ENTRIES = parseInt(process.env.CACHE_MAX_ENTRIES || '2000', 10);
const ENABLED = process.env.CACHE_ENABLED !== 'false';

const store = new Map(); // key -> { body, expires }
const inflight = new Map(); // key -> Promise<body|null>
export const stats = { hits: 0, misses: 0, stored: 0, invalidations: 0 };

const prefix = (user) => `u:${user.id}:t:${user.tenantId || 'none'}:`;

function sweep() {
  const now = Date.now();
  for (const [k, v] of store) if (v.expires <= now) store.delete(k);
  while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value);
}

export function clearUser(userId) {
  const p = `u:${userId}:`;
  for (const k of store.keys()) if (k.startsWith(p)) store.delete(k);
  stats.invalidations += 1;
}

export function clearAll() {
  store.clear();
  inflight.clear();
}

/** GET middleware. Put it AFTER authenticate / requireTenant / requirePermission. */
export function cacheResponse(ttlSeconds) {
  return async function cacheMiddleware(req, res, next) {
    if (!ENABLED || req.method !== 'GET' || !req.user?.id) return next();
    const key = prefix(req.user) + req.originalUrl;
    try {
      const hit = store.get(key);
      if (hit && hit.expires > Date.now()) {
        stats.hits += 1;
        res.set('X-Cache', 'HIT');
        return res.status(200).json(hit.body);
      }
      // Stampede guard: if the same key is already being loaded, wait for that result.
      if (inflight.has(key)) {
        const body = await inflight.get(key);
        if (body) {
          stats.hits += 1;
          res.set('X-Cache', 'HIT');
          return res.status(200).json(body);
        }
        return next();
      }
      stats.misses += 1;
      let done;
      inflight.set(key, new Promise((r) => (done = r)));
      let settled = false;
      const finish = (body) => {
        if (settled) return;
        settled = true;
        inflight.delete(key);
        done(body);
      };
      const json = res.json.bind(res);
      res.json = (body) => {
        if (res.statusCode === 200 && body && body.success !== false) {
          try {
            store.set(key, { body, expires: Date.now() + ttlSeconds * 1000 });
            stats.stored += 1;
            if (store.size > MAX_ENTRIES) sweep();
          } catch {
            /* ignore */
          }
          finish(body);
        } else finish(null);
        return json(body);
      };
      res.set('X-Cache', 'MISS');
      res.on('close', () => finish(null));
      return next();
    } catch {
      return next();
    }
  };
}

/** App-level middleware: after any successful write by a logged-in user, drop that user's cached reads. */
export function invalidateOnWrite(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  res.on('finish', () => {
    if (res.statusCode < 400 && req.user?.id) clearUser(req.user.id);
  });
  return next();
}
