/* LifeOS service worker.
 * Purpose: make the site installable, load app files fast, show a friendly page when offline, and show alerts (web push).
 * It never stores API responses or any personal data. Only app files (scripts, styles, images) are cached. */
const VERSION = 'lifeos-v2';
const STATIC = `${VERSION}-static`;
const PRECACHE = ['/offline.html', '/icon-192.png', '/icon-512.png', '/favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// The page asks for the update to be applied only when the user clicks "Refresh".
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API (other host), LiveKit, storage: untouched
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;
  if (req.headers.has('range')) return; // audio/video seeking

  // Page loads: always go to the network; if there is no connection show the offline page.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () => (await caches.match('/offline.html')) || Response.error()));
    return;
  }

  // Built files have a hash in their name, so a cached copy never goes stale.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
  }
});

// ── Alerts ──────────────────────────────────────────────────────────
function safePath(p) {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') ? p : '/';
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'LifeOS', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    (async () => {
      // If LifeOS is open and in front of the person, the app already shows it - do not show a second alert.
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (wins.some((w) => w.visibilityState === 'visible' && w.focused)) return;
      await self.registration.showNotification(data.title || 'LifeOS', {
        body: data.body || '',
        icon: '/icon-192.png',
        badge: '/favicon-64.png',
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        requireInteraction: Boolean(data.urgent),
        data: { url: safePath(data.url) },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = safePath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin) {
          await w.focus();
          if ('navigate' in w) await w.navigate(target).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});
