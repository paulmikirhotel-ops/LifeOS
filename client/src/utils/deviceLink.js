// Small pure helpers for "Sign in with QR". No browser or network code here, so they are easy to test.

/** Finds the 48-character code in what a QR holds: a LifeOS link ending in /link/<code>, or the bare code. Anything else gives null. */
export function parseLinkCode(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const bare = s.match(/^[a-f0-9]{48}$/i);
  if (bare) return s.toLowerCase();
  const inUrl = s.match(/\/link\/([a-f0-9]{48})(?:[/?#].*)?$/i);
  return inUrl ? inUrl[1].toLowerCase() : null;
}

/** What the person typed -> "XXXX-XXXX" (same letters the server uses), or null while it is not complete. */
export function cleanPairInput(input) {
  const s = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[2-9A-HJKMNP-Z]{8}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Live typing: keeps only allowed characters and adds the dash, so "k7m29qxf" shows as "K7M2-9QXF". */
export function formatPairTyping(input) {
  const s = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return s.length > 4 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
}

/** 95 -> "1:35", 7 -> "0:07". */
export function clock(seconds) {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

/** "5 minutes ago" style text for the device list. */
export function agoText(iso, now = Date.now()) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** True when an API error means "your email is not verified yet". */
export function isUnverified(err) {
  const d = err?.response?.data;
  return d?.code === 'EMAIL_NOT_VERIFIED' || d?.error?.code === 'EMAIL_NOT_VERIFIED';
}

/** True when an API error means the code is old or already used. */
export function isExpiredLink(err) {
  const d = err?.response?.status === 410 || err?.response?.data?.code === 'LINK_EXPIRED' || err?.response?.data?.error?.code === 'LINK_EXPIRED';
  return Boolean(d);
}
