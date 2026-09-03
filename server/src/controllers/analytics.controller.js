import * as analyticsService from '../services/analytics.service.js';

/**
 * Small per-tenant memo for the expensive 30-day overview aggregation.
 * - Keyed by tenant + query range, so tenants can never share results.
 * - Single-flight: concurrent requests (e.g. React StrictMode double-mount)
 *   share one in-flight computation instead of running it twice.
 * - 30s TTL: analytics pages revisiting during a session load instantly.
 */
const overviewCache = new Map();
const OVERVIEW_TTL_MS = 30_000;
const OVERVIEW_MAX_ENTRIES = 100;

export async function overview(req, res) {
  const { from, to } = req.query;
  const key = `${req.user.tenantId}|${from || ''}|${to || ''}`;

  let entry = overviewCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    const promise = analyticsService
      .overview(req.user, req.user.permissions, { from, to })
      .catch((err) => {
        overviewCache.delete(key); // never cache a failure
        throw err;
      });
    entry = { expiresAt: Date.now() + OVERVIEW_TTL_MS, promise };
    overviewCache.set(key, entry);
    if (overviewCache.size > OVERVIEW_MAX_ENTRIES) {
      const oldest = overviewCache.keys().next().value;
      overviewCache.delete(oldest);
    }
  }

  const data = await entry.promise;
  res.json({ success: true, data });
}

export async function dashboard(req, res) {
  const data = await analyticsService.dashboard(req.user, req.user.permissions);
  res.json({ success: true, data });
}
