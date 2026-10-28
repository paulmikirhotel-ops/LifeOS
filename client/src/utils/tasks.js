import { format, parseISO, differenceInCalendarDays, addDays } from 'date-fns';

/* ── Priorities ─────────────────────────────────────────────────────────── */
export const PRIORITIES = ['urgent', 'high', 'medium', 'low'];

export const PRIORITY_META = {
  urgent: {
    label: 'Urgent',
    rank: 0,
    bar: 'bg-rose-500',
    dot: 'bg-rose-500',
    active: 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-300',
  },
  high: {
    label: 'High',
    rank: 1,
    bar: 'bg-orange-500',
    dot: 'bg-orange-500',
    active: 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/50 dark:bg-orange-500/10 dark:text-orange-300',
  },
  medium: {
    label: 'Medium',
    rank: 2,
    bar: 'bg-amber-400',
    dot: 'bg-amber-400',
    active: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300',
  },
  low: {
    label: 'Low',
    rank: 3,
    bar: 'bg-sky-400',
    dot: 'bg-sky-400',
    active: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/50 dark:bg-sky-500/10 dark:text-sky-300',
  },
};

export const priorityOf = (task) => PRIORITY_META[task?.priority] || PRIORITY_META.medium;

/* ── Statuses ───────────────────────────────────────────────────────────── */
export const STATUS_META = {
  not_started: { label: 'To do', chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  in_progress: { label: 'In progress', chip: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' },
  completed: { label: 'Done', chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  postponed: { label: 'Postponed', chip: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  cancelled: { label: 'Cancelled', chip: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
};

export const isClosed = (task) => task?.status === 'completed' || task?.status === 'cancelled';

/* ── Dates ──────────────────────────────────────────────────────────────── */
export const todayKey = () => format(new Date(), 'yyyy-MM-dd');
export const dateKey = (date) => format(date, 'yyyy-MM-dd');
export const offsetKey = (days) => format(addDays(new Date(), days), 'yyyy-MM-dd');

/**
 * Calendar day (yyyy-MM-dd) a task is due on, or null.
 * The date input stores midnight UTC, so a bare date must be read from the UTC part —
 * reading it in local time would shift it a day in time zones behind UTC.
 * Anything with a real time of day (e.g. a deadline coming from a meeting) uses local time.
 */
export function dueKey(task) {
  if (!task?.dueDate) return null;
  const raw = String(task.dueDate);
  if (/T00:00:00(\.0+)?Z$/.test(raw) || /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : format(d, 'yyyy-MM-dd');
}

export function bucketOf(task, today = todayKey()) {
  if (isClosed(task)) return 'done';
  const key = dueKey(task);
  if (!key) return 'nodate';
  if (key < today) return 'overdue';
  if (key === today) return 'today';
  return 'upcoming';
}

export function formatDue(key, today = todayKey()) {
  if (!key) return '';
  const diff = differenceInCalendarDays(parseISO(key), parseISO(today));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < -1) return `${Math.abs(diff)}d overdue`;
  if (diff < 7) return format(parseISO(key), 'EEE');
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return format(parseISO(key), sameYear ? 'MMM d' : 'MMM d, yyyy');
}

export function formatMinutes(min) {
  if (!min || min < 1) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function clock12(totalMin) {
  const h24 = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h = h24 % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function subtaskProgress(task) {
  const list = Array.isArray(task?.subtasks) ? task.subtasks : [];
  return { total: list.length, done: list.filter((s) => s.isDone).length };
}

/* ── Sorting ────────────────────────────────────────────────────────────── */
export const SORT_OPTIONS = [
  { value: 'due', label: 'Due date' },
  { value: 'priority', label: 'Priority' },
  { value: 'newest', label: 'Newest' },
  { value: 'title', label: 'A → Z' },
];

const time = (v) => (v ? new Date(v).getTime() || 0 : 0);

export function sortTasks(list, mode = 'due') {
  const byDue = (a, b) => {
    const ka = dueKey(a);
    const kb = dueKey(b);
    if (ka && kb && ka !== kb) return ka < kb ? -1 : 1;
    if (ka && !kb) return -1;
    if (!ka && kb) return 1;
    return 0;
  };
  const byPriority = (a, b) => priorityOf(a).rank - priorityOf(b).rank;
  const byNewest = (a, b) => time(b.createdAt) - time(a.createdAt);
  const comparators = {
    due: (a, b) => byDue(a, b) || byPriority(a, b) || byNewest(a, b),
    priority: (a, b) => byPriority(a, b) || byDue(a, b) || byNewest(a, b),
    newest: byNewest,
    title: (a, b) => String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base' }),
  };
  return [...list].sort(comparators[mode] || comparators.due);
}

export const sortDone = (list) =>
  [...list].sort((a, b) => time(b.completedAt || b.updatedAt) - time(a.completedAt || a.updatedAt));
