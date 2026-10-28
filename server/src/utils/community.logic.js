/**
 * Community (Skill Exchange): pure logic, no database.
 * Visibility rules, contact-detail blocking, tag cleaning, limits, report auto-hide.
 */
import { z } from 'zod';

export const LIMITS = {
  tags: 8,
  tagLen: 40,
  requestsPerDay: 10,
  pendingRequests: 20,
  groupsPerDay: 3,
  openGroupsPerUser: 5,
  reportsPerDay: 10,
  reportsToHide: 3, // distinct people reporting the same profile or group
  groupMembersMax: 50,
  groupMembersDefault: 12,
  listingsPerDay: 3,
  openListings: 5,
  interestsPerDay: 10,
  logHoursMax: 24,
  logEntriesPerDay: 20,
};

export const REASONS = ['spam', 'impersonation', 'asks_for_money', 'harassment', 'inappropriate', 'other'];
export const AUDIENCES = ['friends', 'everyone'];

const clip = (s, n) => String(s ?? '')
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, n);
export const cleanLine = clip;

/**
 * Heuristic guard for personal contact details in free text (emails, phone numbers, links, @handles, chat-app names).
 * It cannot catch everything; it stops the common cases so people use Connect after they both agree.
 */
export function looksLikeContact(text) {
  const t = String(text ?? '');
  if (/[A-Z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[A-Z0-9.-]+\s*(?:\.|\(dot\)|\[dot\])\s*[A-Z]{2,}/i.test(t)) return true;
  if (/(?:https?:\/\/|www\.)\S+/i.test(t)) return true;
  if (/\b[a-z0-9-]+\.(?:com|net|org|io|me|co|app|link|ly|chat)\b/i.test(t)) return true;
  if (/(?:^|\s)@[a-z0-9_.]{3,}/i.test(t)) return true;
  if (/\b(?:whats\s?app|telegram|signal|snap\s?chat|insta(?:gram)?|facebook|messenger|wechat|viber|call me|text me|dm me)\b/i.test(t)) return true;
  // 7+ digits once separators are ignored (phone numbers), without flagging plain years or small numbers
  const digitRuns = t.match(/\+?\d[\d\s().-]{5,}\d/g) || [];
  return digitRuns.some((r) => r.replace(/\D/g, '').length >= 7);
}

export const CONTACT_MESSAGE = "Please don't put phone numbers, emails, links or chat handles here. Use Connect chat once you both agree.";

/** Throws Error(CONTACT_MESSAGE) if any field looks like it holds contact details. */
export function assertNoContact(fields) {
  for (const v of Object.values(fields)) {
    const list = Array.isArray(v) ? v : [v];
    if (list.some((x) => looksLikeContact(x))) throw Object.assign(new Error(CONTACT_MESSAGE), { contact: true });
  }
}

export function cleanTags(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const v = clip(raw, LIMITS.tagLen).toLowerCase();
    if (v.length >= 2 && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
    if (out.length >= LIMITS.tags) break;
  }
  return out;
}

export const profileSchema = z.object({
  enabled: z.boolean().optional(),
  displayName: z.string().trim().min(2).max(40).optional(),
  intro: z.string().trim().max(300).optional(),
  offers: z.array(z.string().trim().max(LIMITS.tagLen)).max(LIMITS.tags).optional(),
  wants: z.array(z.string().trim().max(LIMITS.tagLen)).max(LIMITS.tags).optional(),
  language: z.string().trim().max(40).optional(),
  availability: z.string().trim().max(80).optional(),
  audience: z.enum(AUDIENCES).optional(),
});

/** A profile is listable only when its owner switched it on, it has a name and something to offer or learn, and it is not hidden. */
export function isListable(p) {
  return Boolean(p && p.enabled && !p.hidden && p.displayName && ((p.offers?.length || 0) + (p.wants?.length || 0) > 0));
}

/** May `viewer` see something published with `audience` by `ownerId`? Blocks always win. */
export function canView({ audience, isFriend, blocked, isOwner }) {
  if (isOwner) return true;
  if (blocked) return false;
  return audience === 'everyone' || Boolean(isFriend);
}

/** Simple readable search over a profile or group. */
export function matchesQuery(fields, q) {
  const needle = clip(q, 60).toLowerCase();
  if (!needle) return true;
  return fields.some((f) => (Array.isArray(f) ? f.join(' ') : String(f || '')).toLowerCase().includes(needle));
}

/** New accounts wait before they can publish listings (anti-spam). Requests are allowed. */
export function newAccountWaitHours(raw = process.env.COMMUNITY_NEW_ACCOUNT_HOURS) {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(168, Math.max(0, n)) : 24;
}
export function mayPublish(createdAt, now = new Date(), hours = newAccountWaitHours()) {
  if (!createdAt || hours === 0) return { ok: true };
  const readyAt = new Date(new Date(createdAt).getTime() + hours * 3600000);
  return now >= readyAt ? { ok: true } : { ok: false, readyAt };
}

export const shouldHide = (distinctReporters) => distinctReporters >= LIMITS.reportsToHide;

export const requestSchema = z.object({ userId: z.string().length(24), message: z.string().trim().max(200).optional() });
export const groupSchema = z.object({
  title: z.string().trim().min(3).max(80),
  topic: z.string().trim().max(60).optional(),
  description: z.string().trim().max(400).optional(),
  language: z.string().trim().max(40).optional(),
  audience: z.enum(AUDIENCES).optional(),
  maxMembers: z.number().int().min(2).max(LIMITS.groupMembersMax).optional(),
  nextSessionAt: z.string().datetime().nullable().optional(),
});
export const groupPatchSchema = groupSchema.partial().extend({ status: z.enum(['open', 'closed']).optional() });
export const IMPACT_CATEGORIES = ['volunteering', 'tutoring', 'digital_skills', 'project'];
export const IMPACT_MODES = ['online', 'in_person', 'both'];

/** Listings must never ask people for money or payment details. Heuristic, so reports still matter. */
export function looksLikeMoneyAsk(text) {
  return /\b(?:registration|application|processing|admin(?:istration)?|training|placement|joining)\s+fees?\b|\bsend\s+(?:me\s+)?money\b|western\s*union|moneygram|mobile\s*money|momo\b|\bgift\s*cards?\b|\bbitcoin\b|\bcrypto\b|\bpay\s+(?:a\s+)?(?:fee|deposit|first|upfront|to\s+(?:apply|join|start))\b|\bdeposit\s+required\b|\bbank\s+(?:account|details)\b/i.test(String(text ?? ''));
}
export const MONEY_MESSAGE = 'Listings cannot ask people to pay or send money. Free help only; leave fees and payment details out.';
export function assertNoMoneyAsk(fields) {
  for (const v of Object.values(fields)) {
    const list = Array.isArray(v) ? v : [v];
    if (list.some((x) => looksLikeMoneyAsk(x))) throw Object.assign(new Error(MONEY_MESSAGE), { money: true });
  }
}

export const listingSchema = z.object({
  category: z.enum(IMPACT_CATEGORIES),
  title: z.string().trim().min(4).max(100),
  description: z.string().trim().min(10).max(500),
  skills: z.array(z.string().trim().max(LIMITS.tagLen)).max(LIMITS.tags).optional(),
  location: z.string().trim().max(80).optional(), // a town or "Online", never a street address
  mode: z.enum(IMPACT_MODES).optional(),
  spots: z.number().int().min(1).max(100).optional(),
  startsAt: z.string().datetime().nullable().optional(),
  orgName: z.string().trim().max(80).optional(),
  audience: z.enum(AUDIENCES).optional(),
});
export const listingPatchSchema = listingSchema.partial().extend({ status: z.enum(['open', 'closed']).optional() });
export const logSchema = z.object({
  title: z.string().trim().min(2).max(100),
  hours: z.number().min(0.25).max(LIMITS.logHoursMax),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(200).optional(),
  listingId: z.string().length(24).optional(),
  shared: z.boolean().optional(),
});
export const logPatchSchema = z.object({ shared: z.boolean().optional(), note: z.string().trim().max(200).optional() });

export const reportSchema = z.object({
  targetType: z.enum(['profile', 'group', 'listing']),
  userId: z.string().length(24).optional(),
  groupId: z.string().length(24).optional(),
  listingId: z.string().length(24).optional(),
  reason: z.enum(REASONS),
  details: z.string().trim().max(500).optional(),
}).refine((v) => (v.targetType === 'profile' ? v.userId : v.targetType === 'group' ? v.groupId : v.listingId), { message: 'Missing target' });
