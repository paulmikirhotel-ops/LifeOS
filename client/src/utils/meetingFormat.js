import { format } from 'date-fns';

export const MEETING_TYPES = [
  { value: 'team', label: 'Team Meeting' },
  { value: 'business', label: 'Business Meeting' },
  { value: 'class', label: 'Class/Lecture' },
  { value: 'project', label: 'Project Meeting' },
  { value: 'interview', label: 'Interview' },
  { value: 'community', label: 'Community Meeting' },
  { value: 'personal', label: 'Personal Meeting' },
  { value: 'other', label: 'Other' },
];
export const typeLabel = (v) => MEETING_TYPES.find((t) => t.value === v)?.label || 'Meeting';

export const REMINDER_OPTIONS = [
  { value: 1440, label: '1 day before' },
  { value: 60, label: '1 hour before' },
  { value: 30, label: '30 minutes before' },
  { value: 15, label: '15 minutes before' },
];

const STARTING_SOON_MS = 15 * 60 * 1000;

/**
 * Display status. "Starting Soon" and "Not held" are derived on the client from the clock:
 * the server only stores scheduled / live / completed / cancelled.
 */
export function statusInfo(m, now = Date.now()) {
  if (m.status === 'cancelled') return { key: 'cancelled', label: 'Cancelled', variant: 'error' };
  if (m.status === 'live') return { key: 'live', label: 'Live', variant: 'error', pulse: true };
  if (m.status === 'completed') return { key: 'completed', label: 'Completed', variant: 'success' };
  const start = new Date(m.startAt).getTime();
  const end = new Date(m.endAt).getTime();
  if (now > end) return { key: 'missed', label: 'Not held', variant: 'warning' };
  if (start - now <= STARTING_SOON_MS) return { key: 'soon', label: 'Starting Soon', variant: 'warning' };
  return { key: 'scheduled', label: 'Scheduled', variant: 'info' };
}

export function formatCountdown(ms) {
  if (ms <= 0) return 'now';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

export function formatDuration(sec) {
  if (!sec && sec !== 0) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m} min`;
  return `${sec}s`;
}

export function clock(ms = 0) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
export const timer = (ms = 0) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60].map((n) => String(n).padStart(2, '0')).join(':');
};

export const dayLabel = (iso) => format(new Date(iso), 'EEE, MMM d');
export const timeLabel = (iso) => format(new Date(iso), 'h:mm a');
export const rangeLabel = (m) => `${dayLabel(m.startAt)} · ${timeLabel(m.startAt)} – ${timeLabel(m.endAt)}`;

export const speakerName = (s) => s.speakerName || s.speakerLabel || 'Speaker';

/** Wall-clock time of a transcript line: meeting start + offset. */
export function lineClock(startedAtIso, startMs) {
  if (!startedAtIso) return clock(startMs);
  return format(new Date(new Date(startedAtIso).getTime() + startMs), 'h:mm a');
}

export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';

export const STAGE_LABELS = {
  transcript: 'Transcript',
  summary: 'AI summary',
  minutes: 'Meeting minutes',
  actionItems: 'Action items',
};

export const ACTION_STATUS_LABELS = { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' };
export const PRIORITY_LABELS = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' };

export async function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
