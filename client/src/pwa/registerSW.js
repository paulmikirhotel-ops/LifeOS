/** Registers the service worker in production builds only (so development is never cached). */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        const announce = () => window.dispatchEvent(new CustomEvent('pwa:update', { detail: reg }));
        if (reg.waiting && navigator.serviceWorker.controller) announce();
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) announce();
          });
        });
      })
      .catch(() => {
        /* the app works fine without it */
      });
  });
}
