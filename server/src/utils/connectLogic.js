/** Pure helpers for LifeOS Connect (no database), so they can be unit-tested. */

export const CONNECT_TEXT_MAX = 4000;

/** One stable key for a pair of users, whichever order they are given in. */
export function pairKey(a, b) {
  return [String(a), String(b)].sort().join(':');
}

/** Message text: strips control characters, keeps line breaks, trims and caps the length. */
export function cleanText(raw, max = CONNECT_TEXT_MAX) {
  return String(raw ?? '')
    .replace(/\r/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, max);
}

/** ObjectIds are 24 hex characters; comparing them as strings follows creation order. */
export function idGte(a, b) {
  if (!a) return false;
  if (!b) return true;
  return String(a) >= String(b);
}

/** Tick state of a message I sent, from the other person's receipts. */
export function messageStatus(messageId, other) {
  if (other && idGte(other.readUpTo, messageId)) return 'read';
  if (other && idGte(other.deliveredUpTo, messageId)) return 'delivered';
  return 'sent';
}

export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What the person typed in "find people": an exact e-mail, or part of a name. Too short means no search. */
export function searchTerm(raw) {
  const v = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (v.length < 2) return null;
  if (v.includes('@')) return { kind: 'email', value: v.toLowerCase() };
  return { kind: 'name', value: v };
}

/** How the other person relates to me, from the friendship row (or none). */
export function relationOf(friendship, me) {
  if (!friendship) return 'none';
  if (friendship.status === 'accepted') return 'friend';
  return String(friendship.requesterId) === String(me) ? 'outgoing' : 'incoming';
}

/** Allows at most `limit` actions per `windowMs` per key (in memory; fine for one server). */
export function createFlood(limit, windowMs, now = () => Date.now()) {
  const hits = new Map();
  return (key) => {
    const t = now();
    const arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
    if (arr.length >= limit) { hits.set(key, arr); return false; }
    arr.push(t);
    hits.set(key, arr);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((x) => t - x < windowMs)) hits.delete(k);
    return true;
  };
}

/** Smallest id in a list (as strings). Returns null if any is missing, meaning "not everybody has it yet". */
export function minId(ids) {
  if (!ids.length || ids.some((x) => !x)) return null;
  return ids.map(String).sort()[0];
}

/** Tick state of one of MY messages, given the receipts of everybody else in the conversation. */
export function statusAmong(messageId, others) {
  if (!others.length) return 'sent';
  const read = minId(others.map((o) => o.readUpTo));
  if (read && idGte(read, messageId)) return 'read';
  const delivered = minId(others.map((o) => o.deliveredUpTo));
  if (delivered && idGte(delivered, messageId)) return 'delivered';
  return 'sent';
}

export const RESOURCE_ICON = { task: '✅', goal: '🎯', event: '📅', meeting: '🎥', note: '📝' };

/** Short text for the chat list and reply quotes. */
export function previewOf(m) {
  if (!m) return '';
  if (m.deletedAt) return 'Message deleted';
  switch (m.kind) {
    case 'image': return m.text ? `📷 ${m.text}` : '📷 Photo';
    case 'video': return m.text ? `🎬 ${m.text}` : '🎬 Video';
    case 'audio': return '🎵 Audio';
    case 'file': return `📄 ${m.attachment?.name || 'Document'}`;
    case 'contact': return `👤 ${m.contact?.name || 'Contact'}`;
    case 'resource': return `${RESOURCE_ICON[m.resource?.type] || '🔗'} ${m.resource?.title || 'Shared item'}`;
    default: return String(m.text || '');
  }
}

export function cleanGroupName(raw) {
  return cleanText(String(raw ?? '').replace(/\n+/g, ' '), 60);
}

// ── reactions ──
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

/** New reaction list after `userId` picks `emoji` (picking the same one again removes it; null removes). One reaction per person. */
export function applyReaction(list = [], userId, emoji) {
  const mine = list.find((r) => String(r.userId) === String(userId));
  const rest = list.filter((r) => String(r.userId) !== String(userId));
  if (!emoji || !REACTIONS.includes(emoji) || (mine && mine.emoji === emoji)) return rest;
  return [...rest, { userId, emoji }];
}
