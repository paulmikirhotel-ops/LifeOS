import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Who may read a meeting's minutes, and how they are told about them.
 *
 * The organizer's meeting is the only copy: nothing is duplicated per participant. Link joiners get READ-ONLY
 * access to the summary, minutes and action items (never the recording or transcript) in two ways:
 *   1. with their meeting pass (they are still in the same browser), or
 *   2. with a personal "minutes key" that is e-mailed to them. The key is an HMAC, so it cannot be guessed,
 *      and it is tied to ONE meeting.
 */

const EMAIL_RE = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[^\s@<>"]{2,24}$/;
const keyOf = () => crypto.createHmac('sha256', env.invite.tokenSecret).update('minutes-key:v1').digest();
const sig = (body) => crypto.createHmac('sha256', keyOf()).update(body).digest('base64url').slice(0, 32);

/** Returns a clean lower-case address, or '' when it is empty/invalid. */
export function cleanEmail(raw) {
  const v = String(raw || '').trim().toLowerCase();
  return v.length <= 254 && EMAIL_RE.test(v) ? v : '';
}

/** Personal read-only key for one person (identified by an e-mail or participant id) and one meeting. */
export function signMinutesKey(meetingId, who) {
  const body = Buffer.from(`${meetingId}|${String(who).toLowerCase()}`).toString('base64url');
  return `${body}.${sig(body)}`;
}

/** Returns { meetingId, who } or null. Constant-time signature check. */
export function verifyMinutesKey(key) {
  const [body, mac, extra] = String(key || '').split('.');
  if (!body || !mac || extra !== undefined) return null;
  const a = Buffer.from(mac);
  const b = Buffer.from(sig(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const [meetingId, who] = Buffer.from(body, 'base64url').toString().split('|');
  return meetingId && who ? { meetingId, who } : null;
}

/**
 * Everyone who should be e-mailed the minutes: guests who left an e-mail, signed-in joiners, and people listed on
 * the meeting with an address. De-duplicated by address; the organizer is excluded (they get the in-app alert).
 * `rows` are plain objects: { email, name }.
 */
export function dedupeRecipients(rows, excludeEmails = []) {
  const skip = new Set(excludeEmails.map((e) => String(e || '').toLowerCase()));
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const email = cleanEmail(r.email);
    if (!email || skip.has(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name: String(r.name || '').slice(0, 80) });
  }
  return out.slice(0, 200);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Plain + HTML e-mail. Only the title, date and a link: the content itself stays behind the key. */
export function buildMinutesEmail({ title, organizerName, startAt, name, url }) {
  const when = startAt ? new Date(startAt).toUTCString().replace(/ GMT$/, ' UTC') : '';
  const hello = name ? `Hi ${name},` : 'Hello,';
  const subject = `Minutes ready: ${title}`;
  const text = `${hello}\n\nThe minutes for "${title}"${organizerName ? ` (organized by ${organizerName})` : ''}${when ? `, held ${when}` : ''}, are ready.\n\nRead them here:\n${url}\n\nThis link is personal to you — please don't forward it. It shows the summary, minutes and action items (not the recording).\n\n— LifeOS`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#0f172a"><p>${esc(hello)}</p><p>The minutes for <b>${esc(title)}</b>${organizerName ? ` (organized by ${esc(organizerName)})` : ''} are ready.</p><p><a href="${esc(url)}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">Read the minutes</a></p><p style="font-size:12px;color:#64748b">This link is personal to you — please don't forward it. It shows the summary, minutes and action items (not the recording).</p></div>`;
  return { subject, text, html };
}
