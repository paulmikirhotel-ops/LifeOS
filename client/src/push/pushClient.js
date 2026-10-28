import api from '../api/client.js';

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const toKey = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

async function registration() {
  if (!import.meta.env.PROD) return null; // the service worker only runs in the built site
  return navigator.serviceWorker.ready;
}

export async function getState() {
  if (!pushSupported()) return { status: 'unsupported' };
  if (!import.meta.env.PROD) return { status: 'dev' };
  const cfg = (await api.get('/push/config')).data;
  if (!cfg?.enabled) return { status: 'server-off' };
  if (Notification.permission === 'denied') return { status: 'blocked' };
  const reg = await registration();
  const sub = await reg.pushManager.getSubscription();
  return { status: sub && Notification.permission === 'granted' ? 'on' : 'off' };
}

async function subscribeDevice(publicKey) {
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
  await api.post('/push/subscribe', { subscription: sub.toJSON() });
}

export async function enable() {
  const cfg = (await api.get('/push/config')).data;
  if (!cfg?.enabled) throw new Error('Alerts are not set up on this server yet.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser settings for this site.');
  await subscribeDevice(cfg.publicKey);
}

export async function disable() {
  const reg = await registration();
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
}

export async function sendTest() {
  return (await api.post('/push/test')).data;
}

/** After sign-in: if this device already allowed alerts, quietly connect it to this account. */
export async function syncExisting() {
  try {
    if (!pushSupported() || !import.meta.env.PROD || Notification.permission !== 'granted') return;
    const cfg = (await api.get('/push/config')).data;
    if (cfg?.enabled) await subscribeDevice(cfg.publicKey);
  } catch {
    /* never bother the person */
  }
}
