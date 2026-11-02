import crypto from 'node:crypto';
import { pushTokensFor, dropPushToken } from './session.service.js';

/**
 * Rings the LifeOS Android app when someone calls and the app is closed (Firebase Cloud Messaging, HTTP v1).
 * No extra package: a signed token is made with Node's own crypto.
 *
 * Setting (Render -> Environment):  FCM_SERVICE_ACCOUNT = the whole service-account JSON file, pasted as one value
 * (a base64 copy of it also works). Without it this file does nothing and never causes an error.
 */
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const b64u = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');

/** Reads the setting. Returns null when it is missing or broken. */
export function readAccount(raw = process.env.FCM_SERVICE_ACCOUNT) {
  let text = String(raw || '').trim();
  if (!text) return null;
  try {
    if (!text.startsWith('{')) text = Buffer.from(text, 'base64').toString('utf8');
    const a = JSON.parse(text);
    if (!a.project_id || !a.client_email || !a.private_key) return null;
    return { projectId: a.project_id, email: a.client_email, key: String(a.private_key).replace(/\\n/g, '\n'), tokenUri: a.token_uri || 'https://oauth2.googleapis.com/token' };
  } catch { return null; }
}
export const fcmConfigured = () => Boolean(readAccount());

let cached = { token: '', until: 0, email: '' };

/** A Google access token, kept until shortly before it ends. */
export async function accessToken(acct, { fetchFn = fetch, now = Date.now() } = {}) {
  if (cached.token && cached.email === acct.email && cached.until > now + 60_000) return cached.token;
  const iat = Math.floor(now / 1000);
  const head = b64u({ alg: 'RS256', typ: 'JWT' });
  const body = b64u({ iss: acct.email, scope: SCOPE, aud: acct.tokenUri, iat, exp: iat + 3600 });
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(acct.key).toString('base64url');
  const r = await fetchFn(acct.tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${sig}` }).toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Google sign-in for push failed (${r.status})`);
  cached = { token: j.access_token, until: now + (Number(j.expires_in) || 3000) * 1000, email: acct.email };
  return cached.token;
}
export const resetTokenCache = () => { cached = { token: '', until: 0, email: '' }; };

/** The message for one phone. High priority, 30 seconds to live (a call that rang out is no use later), in the "calls" channel. */
export function buildMessage(token, { title, body, callId, url = '/connect' }) {
  return {
    message: {
      token,
      notification: { title: String(title).slice(0, 80), body: String(body).slice(0, 120) },
      data: { url, type: 'call', callId: String(callId || '') },
      android: {
        priority: 'HIGH',
        ttl: '30s',
        collapse_key: `call-${callId || 'x'}`,
        notification: { channel_id: 'calls', sound: 'default', tag: `call-${callId || 'x'}`, default_vibrate_timings: true, notification_priority: 'PRIORITY_MAX', visibility: 'PUBLIC' },
      },
    },
  };
}

/** Rings every signed-in phone of one person. Never throws. Returns how many phones were sent to. */
export async function sendCallPush(userId, info, { fetchFn = fetch, now = Date.now() } = {}) {
  try {
    const acct = readAccount();
    if (!acct) return 0;
    const tokens = await pushTokensFor(userId);
    if (!tokens.length) return 0;
    const bearer = await accessToken(acct, { fetchFn, now });
    let sent = 0;
    await Promise.all(tokens.map(async (t) => {
      try {
        const r = await fetchFn(`https://fcm.googleapis.com/v1/projects/${acct.projectId}/messages:send`, {
          method: 'POST',
          headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
          body: JSON.stringify(buildMessage(t, info)),
        });
        if (r.ok) { sent += 1; return; }
        const j = await r.json().catch(() => ({}));
        const code = j?.error?.details?.find?.((d) => d.errorCode)?.errorCode || j?.error?.status || '';
        if (r.status === 404 || code === 'UNREGISTERED') await dropPushToken(t); // the app was uninstalled
        else if (r.status === 401) resetTokenCache();
      } catch { /* one phone failing must not stop the others */ }
    }));
    return sent;
  } catch (e) {
    console.warn('[fcm] call push failed:', e?.message || e);
    return 0;
  }
}
