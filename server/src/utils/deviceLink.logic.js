import crypto from 'node:crypto';
import { z } from 'zod';

/**
 * Plain rules for "Sign in with QR" and for being signed in on several devices.
 * No database and no Express in here, so every rule can be tested on its own.
 */

/** A QR code works for 2 minutes and only once. */
export const QR_TTL_MS = 2 * 60 * 1000;
/** After the phone taps Allow, the computer has this long to collect the sign-in (it asks every 2 seconds). */
export const APPROVED_CLAIM_MS = 30 * 1000;
/** A signed-in device stays signed in for 7 days after its last use (same as before). */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Devices that can be signed in at the same time. The one used longest ago is signed out first. */
export const MAX_SESSIONS = 10;

/** No 0, 1, O, I or L, so a code read aloud or typed from a screen is not mixed up. */
const PAIR_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** A short code shown under the QR on the computer and again on the phone, for example "K7M2-9QXF". */
export function newPairCode(randomInt = crypto.randomInt) {
  let out = '';
  for (let i = 0; i < 8; i += 1) out += PAIR_ALPHABET[randomInt(0, PAIR_ALPHABET.length)];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/** What a person typed -> "XXXX-XXXX", or null when it cannot be a pair code. */
export function normalizePair(input) {
  const raw = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.length !== 8) return null;
  if ([...raw].some((c) => !PAIR_ALPHABET.includes(c))) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** "Chrome on Windows", "LifeOS app on Android" ... from the browser's user-agent text. */
export function describeDevice(userAgent = '') {
  const ua = String(userAgent || '');
  const app = /LifeOSApp/i.test(ua);
  let os = '';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  let browser = 'Browser';
  if (app) browser = 'LifeOS app';
  else if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Firefox\/|FxiOS/.test(ua)) browser = 'Firefox';
  else if (/Chrome\/|CriOS/.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  return { label: os ? `${browser} on ${os}` : browser, kind: app ? 'app' : 'web' };
}

/** Hides the last part of an address so the list of devices does not show a full IP. */
export function maskIp(ip) {
  const v = String(ip || '').replace(/^::ffff:/, '').trim();
  if (!v) return '';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return `${v.split('.').slice(0, 3).join('.')}.•`;
  if (v.includes(':')) return `${v.split(':').slice(0, 2).join(':')}:…`;
  return '';
}

/**
 * pending   - waiting for the phone
 * approved  - the phone said Allow (the computer can collect the sign-in for a short time)
 * denied / used / expired - finished
 */
export function qrState(row, now = new Date()) {
  if (!row) return 'expired';
  const t = now instanceof Date ? now.getTime() : Number(now);
  if (row.status === 'pending') return t >= new Date(row.expiresAt).getTime() ? 'expired' : 'pending';
  if (row.status === 'approved') {
    const at = row.approvedAt ? new Date(row.approvedAt).getTime() : 0;
    return t - at > APPROVED_CLAIM_MS ? 'expired' : 'approved';
  }
  return row.status === 'denied' ? 'denied' : row.status === 'used' ? 'used' : 'expired';
}

export const secondsLeft = (expiresAt, now = new Date()) => Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 1000));

const hex48 = z.string().regex(/^[a-f0-9]{48}$/, 'Invalid code');
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const statusSchema = z.object({ code: hex48, secret: hex48 });
export const codeSchema = z.object({ code: hex48 });
export const pairSchema = z.object({ pair: z.string().min(8).max(14) });
/** Approve or deny: the long code from the QR, or the "ref" returned after typing the pair code. */
export const targetSchema = z
  .object({ code: hex48.optional(), ref: objectId.optional() })
  .refine((v) => Boolean(v.code) !== Boolean(v.ref), { message: 'Send either code or ref' });
export const idParamSchema = z.object({ id: objectId });
