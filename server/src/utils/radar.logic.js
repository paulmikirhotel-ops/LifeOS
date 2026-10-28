/**
 * Opportunity Radar: pure logic (no database, no network).
 * URL safety, a small RSS/Atom reader, keyword matching, deadline reading and expiry.
 */
import net from 'node:net';
import crypto from 'node:crypto';
import { z } from 'zod';

export const LIMITS = { sources: 10, itemsPerSource: 150, keywords: 20, staleDays: 60, maxUrl: 500 };
export const TYPES = ['job', 'scholarship', 'grant', 'other'];
const DAY = 86400000;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// ───────────────────────── Address safety ─────────────────────────

/** True when an IP address is private, local, link-local, reserved or multicast (must never be fetched). */
export function isPrivateIp(ip) {
  const kind = net.isIP(ip);
  if (kind === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (kind === 6) {
    const v = ip.toLowerCase().split('%')[0];
    if (v === '::' || v === '::1') return true;
    const mapped = v.match(/^(?:0{0,4}:){0,5}(?:ffff:)(\d+\.\d+\.\d+\.\d+)$/) || v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    const hexMapped = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMapped) {
      const hi = parseInt(hexMapped[1], 16), lo = parseInt(hexMapped[2], 16);
      return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    const first = parseInt(v.split(':')[0] || '0', 16);
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00;
  }
  return true; // not an IP at all: refuse
}

/** Returns { ok, url, reason }. Only public https on the standard port, no credentials. */
export function checkFeedUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    return { ok: false, reason: 'That is not a valid web address.' };
  }
  if (String(raw).length > LIMITS.maxUrl) return { ok: false, reason: 'That address is too long.' };
  if (u.protocol !== 'https:') return { ok: false, reason: 'Only secure (https) feed addresses are allowed.' };
  if (u.username || u.password) return { ok: false, reason: 'Addresses with a username or password are not allowed.' };
  if (u.port && u.port !== '443') return { ok: false, reason: 'Only the standard secure port is allowed.' };
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') && !net.isIP(host)) {
    return { ok: false, reason: 'That address points to a private or local place, so it is not allowed.' };
  }
  if (net.isIP(host) && isPrivateIp(host)) return { ok: false, reason: 'That address points to a private or local place, so it is not allowed.' };
  u.hash = '';
  return { ok: true, url: u.toString() };
}

/** Item links shown to the user: http(s) only, never javascript: or data:. */
export function safeItemLink(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    return { link: u.toString().slice(0, 1000), domain: u.hostname.replace(/^www\./, '').toLowerCase() };
  } catch {
    return null;
  }
}

// ───────────────────────── Feed reader (RSS 2.0 and Atom) ─────────────────────────

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

export function stripHtml(s) {
  const noTags = String(s ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
  return clip(decodeEntities(noTags), 100000);
}

function tag(block, names) {
  for (const n of names) {
    const re = new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i');
    const m = block.match(re);
    if (m) {
      const cdata = m[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
      return cdata ? cdata[1] : decodeEntities(m[1]);
    }
  }
  return '';
}

function atomLink(block) {
  const links = [...block.matchAll(/<link\b([^>]*?)\/?>/gi)].map((m) => m[1]);
  const pick = links.find((a) => /rel\s*=\s*["']alternate["']/i.test(a)) || links.find((a) => !/rel\s*=/i.test(a)) || links[0];
  const href = pick?.match(/href\s*=\s*["']([^"']+)["']/i);
  return href ? decodeEntities(href[1]) : '';
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const monthIndex = (w) => {
  const k = String(w).toLowerCase().replace('.', '');
  const i = MONTHS.findIndex((m) => m === k || m.slice(0, 3) === k || (k === 'sept' && m === 'september'));
  return i;
};
const utc = (y, m, d) => {
  const t = new Date(Date.UTC(y, m, d, 23, 59, 59));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m && t.getUTCDate() === d && y >= 2000 && y <= 2100 ? t : null;
};

/** Reads one date from text: "2026-11-15", "15 November 2026", "November 15, 2026". Slash dates are skipped (ambiguous). */
export function parseDateLoose(text) {
  const s = String(text || '');
  let m = s.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (m) return utc(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?,?\s+(20\d{2})\b/);
  if (m && monthIndex(m[2]) >= 0) return utc(+m[3], monthIndex(m[2]), +m[1]);
  m = s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/);
  if (m && monthIndex(m[1]) >= 0) return utc(+m[3], monthIndex(m[1]), +m[2]);
  return null;
}

/** A deadline only when the feed itself states one: a dedicated tag, or "deadline / closing date / apply by" text. */
export function extractDeadline(block, text) {
  const tagged = tag(block, ['deadline', 'closingdate', 'closing_date', 'expires', 'expirationdate', 'dcterms:valid', 'enddate']);
  if (tagged) {
    const d = parseDateLoose(tagged) || (Number.isNaN(Date.parse(tagged)) ? null : new Date(Date.parse(tagged)));
    if (d) return d;
  }
  const m = String(text || '').match(/(?:deadline|closing date|closes|apply by|applications? close(?:s|d)?(?: on)?|due date)\s*(?:is|:|-|–|on)?\s*([^.;|\n]{4,40})/i);
  return m ? parseDateLoose(m[1]) : null;
}

export function guessType(title, summary) {
  const t = `${title} ${summary}`.toLowerCase();
  if (/\b(scholarship|fellowship|bursary|tuition|stipend)\b/.test(t)) return 'scholarship';
  if (/\b(grant|grants|funding|seed fund|prize|award)\b/.test(t)) return 'grant';
  if (/\b(job|jobs|hiring|vacanc(?:y|ies)|career|position|internship|intern|recruit\w*|apply for|engineer|developer|analyst|manager)\b/.test(t)) return 'job';
  return 'other';
}

const parseDate = (s) => {
  const t = Date.parse(String(s || ''));
  return Number.isNaN(t) ? null : new Date(t);
};

export const itemHash = (guid, link, title) => crypto.createHash('sha1').update(`${guid || link || ''}|${title}`).digest('hex');

/**
 * Parse a feed. Returns { title, items[] } or throws Error('NOT_A_FEED').
 * Entities are only decoded, never expanded, and DOCTYPE tricks are ignored.
 */
export function parseFeed(xml, { now = new Date(), sourceType = 'auto' } = {}) {
  const text = String(xml || '').replace(/^﻿/, '');
  const isAtom = /<feed[\s>]/i.test(text);
  const isRss = /<rss[\s>]|<rdf:RDF[\s>]|<channel[\s>]/i.test(text);
  if (!isAtom && !isRss) throw new Error('NOT_A_FEED');
  const re = isAtom ? /<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi : /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  const head = text.split(isAtom ? /<entry[\s>]/i : /<item[\s>]/i)[0];
  const feedTitle = clip(stripHtml(tag(head, ['title'])), 120);

  const items = [];
  let m;
  while ((m = re.exec(text)) && items.length < LIMITS.itemsPerSource) {
    const b = m[1];
    const title = clip(stripHtml(tag(b, ['title'])), 200);
    const rawLink = isAtom ? atomLink(b) : clip(tag(b, ['link']), 1000) || clip(tag(b, ['guid']), 1000);
    const l = safeItemLink(rawLink);
    if (!title || !l) continue;
    const summary = clip(stripHtml(tag(b, isAtom ? ['summary', 'content'] : ['description', 'content:encoded'])), 500);
    const publishedAt = parseDate(tag(b, ['pubDate', 'published', 'updated', 'dc:date']));
    const deadline = extractDeadline(b, `${title}. ${summary}`);
    const guessed = guessType(title, summary);
    const fixed = TYPES.includes(sourceType) ? sourceType : null;
    items.push({
      hash: itemHash(clip(tag(b, ['guid', 'id']), 300), l.link, title),
      title,
      link: l.link,
      domain: l.domain,
      summary,
      publishedAt: publishedAt && publishedAt.getTime() <= now.getTime() + DAY ? publishedAt : null,
      deadline,
      type: fixed || guessed,
      typeGuessed: !fixed,
    });
  }
  return { title: feedTitle, items };
}

// ───────────────────────── Matching, expiry, ordering ─────────────────────────

export function normalizeKeywords(list) {
  const seen = new Set();
  const out = [];
  for (const k of Array.isArray(list) ? list : []) {
    const v = clip(k, 40).toLowerCase();
    if (v.length >= 2 && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
    if (out.length >= LIMITS.keywords) break;
  }
  return out;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (hay, kw) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(kw)}($|[^\\p{L}\\p{N}])`, 'iu').test(hay);

/** Readable matching: a keyword in the title counts 2, in the summary counts 1. */
export function matchItem(item, keywords) {
  const matched = [];
  let score = 0;
  for (const kw of keywords) {
    const inTitle = hasWord(item.title || '', kw);
    const inSummary = !inTitle && hasWord(item.summary || '', kw);
    if (inTitle || inSummary) {
      matched.push(kw);
      score += inTitle ? 2 : 1;
    }
  }
  return { score, matched };
}

const startOfDayUtc = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Hidden when the stated deadline has passed, or (no deadline) when the item is older than 60 days. */
export function isExpired(item, now = new Date()) {
  if (item.deadline) return new Date(item.deadline).getTime() < startOfDayUtc(now);
  const ref = item.publishedAt || item.fetchedAt;
  return ref ? now.getTime() - new Date(ref).getTime() > LIMITS.staleDays * DAY : false;
}

export const closingSoon = (item, now = new Date(), days = 7) =>
  !!item.deadline && !isExpired(item, now) && new Date(item.deadline).getTime() - now.getTime() <= days * DAY;

export function daysLeft(item, now = new Date()) {
  if (!item.deadline) return null;
  return Math.ceil((new Date(item.deadline).getTime() - startOfDayUtc(now)) / DAY);
}

/** Best match first, then nearest deadline, then newest. */
export function rankItems(items) {
  return [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
    const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    if (da !== db) return da - db;
    return (new Date(b.publishedAt || b.fetchedAt || 0)) - (new Date(a.publishedAt || a.fetchedAt || 0));
  });
}

export const aiWhySchema = z.object({ why: z.string().trim().min(5).max(300) });
export const dailyLimit = (raw = process.env.RADAR_DAILY_AI) => {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 10;
};
