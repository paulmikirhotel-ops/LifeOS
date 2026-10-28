/**
 * Community extras: Learning resources and scheduled mentor sessions. Pure logic, no database.
 */
import { z } from 'zod';
import { REASONS } from './community.logic.js';

export const RES = { perUser: 20, perDay: 5, title: 100, note: 200, url: 300, reportsToHide: 3, reportsPerDay: 10 };
export const SESSION = {
  minMinutes: 15, maxMinutes: 90, step: 5, leadMinutes: 10, maxDaysAhead: 60,
  proposalsPerDay: 10, waitingPerPerson: 10, remindMinutes: 30, note: 200,
};

// ───────────────────────────── learning resources ─────────────────────────────
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
/** A shared link must be a normal public web address (http or https). Returns { ok, url, domain } or { ok: false, reason }. */
export function cleanResourceUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: false, reason: 'Add the web address.' };
  if (s.length > RES.url) return { ok: false, reason: `That web address is too long (up to ${RES.url} characters).` };
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`); } catch { return { ok: false, reason: 'That does not look like a web address.' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, reason: 'Only http and https links can be shared.' };
  if (u.username || u.password) return { ok: false, reason: 'The link cannot contain a user name or password.' };
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.internal') || IPV4.test(host) || host.startsWith('[') || host === 'localhost') {
    return { ok: false, reason: 'Use a public website address, not an IP address or a local one.' };
  }
  u.hash = '';
  return { ok: true, url: u.toString(), domain: host.replace(/^www\./, '') };
}

export const resourceSchema = z.object({
  title: z.string().trim().min(3).max(RES.title),
  url: z.string().trim().min(3).max(RES.url),
  skill: z.string().trim().min(2).max(40),
  note: z.string().trim().max(RES.note).optional().default(''),
});
export const resourceReportSchema = z.object({ reason: z.enum(REASONS), details: z.string().trim().max(500).optional() });
export const resourceAdminStatusSchema = z.object({ status: z.enum(['reviewed', 'dismissed']) });

export const shouldHideResource = (distinctReporters) => distinctReporters >= RES.reportsToHide;

// ───────────────────────────── sessions ─────────────────────────────
const MIN = 60000;
export const endOf = (startsAt, minutes) => new Date(new Date(startsAt).getTime() + minutes * MIN);

/** Is this a time two people could really meet at? */
export function validateSlot(startsAt, minutes, now = new Date()) {
  const s = new Date(startsAt);
  if (Number.isNaN(s.getTime())) return { ok: false, reason: 'Choose a date and time.' };
  if (!Number.isInteger(minutes) || minutes < SESSION.minMinutes || minutes > SESSION.maxMinutes || minutes % SESSION.step !== 0) {
    return { ok: false, reason: `A session lasts ${SESSION.minMinutes} to ${SESSION.maxMinutes} minutes, in steps of ${SESSION.step}.` };
  }
  if (s.getTime() < now.getTime() + SESSION.leadMinutes * MIN) return { ok: false, reason: `Choose a time at least ${SESSION.leadMinutes} minutes from now.` };
  if (s.getTime() > now.getTime() + SESSION.maxDaysAhead * 86400000) return { ok: false, reason: `Choose a time within the next ${SESSION.maxDaysAhead} days.` };
  return { ok: true, endsAt: endOf(s, minutes) };
}
export const overlaps = (a, b) => new Date(a.startsAt) < new Date(b.endsAt) && new Date(b.startsAt) < new Date(a.endsAt);

/** What a person should see for a stored session. */
export function stateOf(s, me, now = new Date()) {
  if (s.status === 'accepted') return new Date(s.endsAt) <= now ? 'done' : 'accepted';
  if (s.status === 'proposed') {
    if (new Date(s.startsAt) <= now) return 'expired';
    return String(s.otherId) === String(me) ? 'waiting_you' : 'waiting_them';
  }
  return s.status; // declined, cancelled, countered
}
/** Reminder window: accepted, not yet reminded, starting within the next N minutes. */
export const reminderDue = (s, now = new Date()) => s.status === 'accepted' && !s.reminderSent && new Date(s.startsAt) > now && new Date(s.startsAt).getTime() - now.getTime() <= SESSION.remindMinutes * MIN;

const slot = {
  startsAt: z.string().datetime(),
  minutes: z.number().int().min(SESSION.minMinutes).max(SESSION.maxMinutes),
  note: z.string().trim().max(SESSION.note).optional().default(''),
};
export const proposeSchema = z.object({ userId: z.string().length(24), ...slot });
export const counterSchema = z.object({ ...slot });
export const respondSchema = z.object({ action: z.enum(['accept', 'decline']) });
