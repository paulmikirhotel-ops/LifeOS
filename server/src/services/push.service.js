import PushSubscription from '../models/pushSubscription.model.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Web push: alerts that reach a phone or computer even when LifeOS is closed.
 * Needs VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (+ VAPID_SUBJECT) in the server .env and the "web-push" package.
 * Without them everything here quietly does nothing, so it can never break the app.
 */
const PUB = () => process.env.VAPID_PUBLIC_KEY || '';
const PRIV = () => process.env.VAPID_PRIVATE_KEY || '';
const MAX_PER_USER = 10;

let lib; // undefined = not tried, null = unavailable, object = ready
async function webpush() {
  if (lib !== undefined) return lib;
  lib = null;
  if (!PUB() || !PRIV()) return lib;
  try {
    const m = await import('web-push');
    const wp = m.default || m;
    wp.setVapidDetails(process.env.VAPID_SUBJECT || `mailto:${process.env.SMTP_USER || 'admin@example.com'}`, PUB(), PRIV());
    lib = wp;
  } catch (err) {
    console.warn('[push] disabled:', err.message);
  }
  return lib;
}

export async function publicConfig() {
  return { enabled: Boolean(await webpush()), publicKey: PUB() || null };
}

/** Keeps payloads small and links on this site only. */
export function sanitize(p = {}) {
  const url = typeof p.url === 'string' && p.url.startsWith('/') && !p.url.startsWith('//') ? p.url.slice(0, 300) : '/';
  return {
    title: String(p.title || 'LifeOS').slice(0, 100),
    body: String(p.body || '').slice(0, 140),
    url,
    tag: p.tag ? String(p.tag).slice(0, 64) : undefined,
    urgent: Boolean(p.urgent),
  };
}

/** Sends one payload to a list of subscriptions. Dead ones (404/410) are reported through onGone. Never throws. */
export async function deliver(subs, payload, wp, onGone = async () => {}) {
  const body = JSON.stringify(sanitize(payload));
  const options = { TTL: payload.urgent ? 45 : 3600, urgency: payload.urgent ? 'high' : 'normal' };
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, options);
        sent += 1;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) await onGone(s).catch(() => {});
        else console.warn('[push] send failed:', err?.statusCode || err?.message);
      }
    })
  );
  return sent;
}

export async function sendToUser(userId, payload) {
  try {
    const wp = await webpush();
    if (!wp) return 0;
    const subs = await PushSubscription.find({ userId }).lean();
    if (!subs.length) return 0;
    return await deliver(subs, payload, wp, (s) => PushSubscription.deleteOne({ _id: s._id }));
  } catch (err) {
    console.warn('[push] sendToUser failed:', err.message);
    return 0;
  }
}

/** Fire-and-forget helper used by the notification code. */
export function pushToUser(userId, payload) {
  sendToUser(userId, payload).catch(() => {});
}

export async function subscribe(userId, sub, userAgent = '') {
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || !p256dh || !auth) throw ApiError.badRequest('Invalid push subscription');
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { $set: { userId, p256dh, auth, userAgent: String(userAgent).slice(0, 300) } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const mine = await PushSubscription.find({ userId }).sort({ updatedAt: -1 }).select('_id').lean();
  if (mine.length > MAX_PER_USER) await PushSubscription.deleteMany({ _id: { $in: mine.slice(MAX_PER_USER).map((m) => m._id) } });
}

export async function unsubscribe(userId, endpoint) {
  if (endpoint) await PushSubscription.deleteOne({ userId, endpoint });
}

export async function removeAllForUser(userId) {
  await PushSubscription.deleteMany({ userId }).catch(() => {});
}
