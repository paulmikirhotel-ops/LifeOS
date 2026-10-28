/**
 * Meeting invitation-link helpers: URL building, share targets, calendar files
 * and the guest pass.
 *
 * Everything here is pure client-side. The link itself is generated and owned by
 * the server (`/meet/<code>`); this module only formats and shares it.
 */

const GUEST_KEY_STORAGE = 'lifeos.guest.pass';

// ── links ───────────────────────────────────────────────────────────────

/** Canonical invitation URL for a meeting code. */
export function inviteUrl(code) {
  if (!code) return '';
  return `${window.location.origin}/meet/${code}`;
}

/** Short, plain-text message used as the share body everywhere. */
export function shareMessage({ title, startAt, url, organizer }) {
  const when = startAt
    ? new Date(startAt).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';
  return [
    `You're invited: ${title}`,
    organizer ? `Organized by ${organizer}` : null,
    when ? `When: ${when}` : null,
    '',
    url,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

// ── guest pass ──────────────────────────────────────────────────────────

/**
 * A random per-device token so a guest can join without an account and still be
 * recognised on their next visit (so the roster gains one row, not five).
 *
 * This is NOT a credential: it grants no access by itself, the server stores only
 * its hash, and it is only ever used to de-duplicate the roster.
 */
export function getGuestPass() {
  try {
    let value = window.localStorage.getItem(GUEST_KEY_STORAGE);
    if (!value || value.length < 32) {
      const bytes = new Uint8Array(24);
      window.crypto.getRandomValues(bytes);
      value = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      window.localStorage.setItem(GUEST_KEY_STORAGE, value);
    }
    return value;
  } catch {
    // Private mode / storage disabled: fall back to an in-memory value for this
    // page load. Joining still works; the guest just won't be re-recognised.
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
}

// ── share targets ───────────────────────────────────────────────────────

/**
 * Share destinations. Each one opens the platform's own composer with the
 * message pre-filled — LifeOS never sends anything on the user's behalf, and no
 * participant list has to be typed in.
 */
export const SHARE_TARGETS = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    // wa.me opens WhatsApp or WhatsApp Web, and the user then picks a contact OR
    // a group — which is exactly the "send it to a WhatsApp group" flow.
    href: ({ message }) => `https://wa.me/?text=${encodeURIComponent(message)}`,
  },
  {
    id: 'telegram',
    label: 'Telegram',
    href: ({ message, url }) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(message)}`,
  },
  {
    id: 'messenger',
    label: 'Messenger',
    // The fb-messenger scheme opens the mobile app; on desktop it is inert, so
    // the UI keeps Copy visible as the universal fallback.
    href: ({ url }) => `fb-messenger://share?link=${encodeURIComponent(url)}`,
  },
  {
    id: 'email',
    label: 'Email',
    href: ({ message, title }) =>
      `mailto:?subject=${encodeURIComponent(`Meeting invitation: ${title}`)}&body=${encodeURIComponent(message)}`,
  },
  {
    id: 'sms',
    label: 'SMS',
    // `sms:?&body=` is the form that both iOS and Android accept.
    href: ({ message }) => `sms:?&body=${encodeURIComponent(message)}`,
  },
  {
    id: 'x',
    label: 'X',
    href: ({ message, url }) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodeURIComponent(url)}`,
  },
];

/** Opens a share target in a new tab. */
export function openShareTarget(target, payload) {
  const href = target.href(payload);
  window.open(href, '_blank', 'noopener,noreferrer');
}

/**
 * Clipboard copy that also works where `navigator.clipboard` is unavailable
 * (older mobile browsers, non-HTTPS origins).
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** True when the device supports the native share sheet. */
export const canNativeShare = () =>
  typeof navigator !== 'undefined' && typeof navigator.share === 'function';

// ── calendar file ───────────────────────────────────────────────────────

/** `2026-10-05T16:00:00Z` → `20261005T160000Z` */
function icsStamp(value) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** RFC 5545 requires escaping backslashes, semicolons, commas and newlines. */
function icsEscape(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Builds an .ics file for the meeting so "Add to calendar" works in Google
 * Calendar, Apple Calendar and Outlook without any account linking.
 */
export function buildIcs({ title, description, location, startAt, endAt, url, organizer, uid }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LifeOS//Meeting//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid || url || icsStamp(startAt)}@lifeos.app`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(startAt)}`,
    `DTEND:${icsStamp(endAt)}`,
    `SUMMARY:${icsEscape(title)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
  if (location) lines.push(`LOCATION:${icsEscape(location)}`);
  if (url) lines.push(`URL:${icsEscape(url)}`);
  if (organizer) lines.push(`ORGANIZER;CN=${icsEscape(organizer)}:mailto:noreply@lifeos.app`);
  // A pop-up reminder one hour before, matching the app's own default.
  lines.push(
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  );
  return lines.join('\r\n');
}

/** Triggers a download of the meeting as an .ics file. */
export function downloadIcs(meeting, url, organizer) {
  const ics = buildIcs({ ...meeting, url, organizer });
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `${String(meeting.title || 'meeting').replace(/[^\w\s-]/g, '').slice(0, 60).trim() || 'meeting'}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}

// ── presentation helpers ────────────────────────────────────────────────

export const ACCESS_MODE_OPTIONS = [
  {
    value: 'public',
    label: 'Anyone with the link',
    hint: 'Anyone who has the link can open the invitation and join.',
  },
  {
    value: 'authenticated',
    label: 'LifeOS accounts only',
    hint: 'People must sign in to a LifeOS account before they can join.',
  },
  {
    value: 'restricted',
    label: 'Invited people only',
    hint: 'Only the participants you add can join. Others can ask to join.',
  },
];

export const accessModeLabel = (mode) =>
  ACCESS_MODE_OPTIONS.find((o) => o.value === mode)?.label || 'LifeOS accounts only';

/** The status shown on the invitation page. */
export function inviteStatusMeta(displayStatus) {
  switch (displayStatus) {
    case 'live':
      return { label: 'In progress', variant: 'error', live: true };
    case 'starting_soon':
      return { label: 'Starting soon', variant: 'warning' };
    case 'ended':
      return { label: 'Ended', variant: 'success' };
    case 'cancelled':
      return { label: 'Cancelled', variant: 'error' };
    default:
      return { label: 'Upcoming', variant: 'info' };
  }
}
