import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';

/** Priority metadata. Every class string is written out in full so Tailwind can see it. */
export const PRIORITIES = {
  urgent: {
    label: 'Urgent', rank: 0,
    bar: 'bg-rose-500', dot: 'bg-rose-500',
    pill: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/25',
  },
  high: {
    label: 'High', rank: 1,
    bar: 'bg-orange-500', dot: 'bg-orange-500',
    pill: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/25',
  },
  medium: {
    label: 'Medium', rank: 2,
    bar: 'bg-amber-400', dot: 'bg-amber-400',
    pill: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25',
  },
  low: {
    label: 'Low', rank: 3,
    bar: 'bg-sky-400', dot: 'bg-sky-400',
    pill: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/25',
  },
};
export const priorityOf = (t) => PRIORITIES[t.priority] || PRIORITIES.medium;

export const STATUSES = [
  { value: 'not_started', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Done' },
  { value: 'postponed', label: 'Postponed' },
  { value: 'cancelled', label: 'Cancelled' },
];
export const statusLabel = (v) => STATUSES.find((s) => s.value === v)?.label || 'To do';

export const isDone = (t) => t.status === 'completed';
export const isClosed = (t) => t.status === 'completed' || t.status === 'cancelled';

/** Local "today" as yyyy-MM-dd. */
export const todayKey = () => format(new Date(), 'yyyy-MM-dd');
export const offsetKey = (days) => format(addDays(new Date(), days), 'yyyy-MM-dd');

/**
 * Due dates come from <input type="date"> and are stored as UTC midnight, so the calendar day is simply the first
 * ten characters of the ISO string. Using that (instead of new Date(...) in the browser's zone) keeps a task due
 * "Friday" on Friday for people west of UTC as well.
 */
export const dueKey = (t) => (t.dueDate ? String(t.dueDate).slice(0, 10) : null);

export function dueInfo(t, today = todayKey()) {
  const key = dueKey(t);
  if (!key) return null;
  const diff = differenceInCalendarDays(parseISO(key), parseISO(today));
  const closed = isClosed(t);
  if (diff < 0 && !closed) return { text: diff === -1 ? 'Yesterday' : `${-diff} days overdue`, tone: 'late' };
  if (diff === 0) return { text: 'Today', tone: closed ? 'plain' : 'today' };
  if (diff === 1) return { text: 'Tomorrow', tone: 'plain' };
  if (diff > 1 && diff < 7) return { text: format(parseISO(key), 'EEE'), tone: 'plain' };
  return { text: format(parseISO(key), 'MMM d'), tone: 'plain' };
}

export const DUE_TONES = {
  late: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/25',
  today: 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/25',
  plain: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
};

export function bucketOf(t, today = todayKey()) {
  if (isClosed(t)) return 'done';
  const key = dueKey(t);
  if (!key) return 'nodate';
  if (key < today) return 'overdue';
  if (key === today) return 'today';
  if (key === offsetKey(1)) return 'tomorrow';
  if (key <= offsetKey(7)) return 'week';
  return 'later';
}

export const BUCKETS = [
  { id: 'overdue', title: 'Overdue' },
  { id: 'today', title: 'Today' },
  { id: 'tomorrow', title: 'Tomorrow' },
  { id: 'week', title: 'This week' },
  { id: 'later', title: 'Later' },
  { id: 'nodate', title: 'No due date' },
  { id: 'done', title: 'Completed' },
];

export function sortTasks(list, sort) {
  const byDue = (a, b) => (dueKey(a) || '9999') .localeCompare(dueKey(b) || '9999');
  const byPri = (a, b) => priorityOf(a).rank - priorityOf(b).rank;
  const byNew = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  const out = [...list];
  if (sort === 'priority') out.sort((a, b) => byPri(a, b) || byDue(a, b) || byNew(a, b));
  else if (sort === 'newest') out.sort(byNew);
  else out.sort((a, b) => byDue(a, b) || byPri(a, b) || byNew(a, b));
  return out;
}

export function taskStats(tasks, today = todayKey()) {
  const weekAgo = Date.now() - 7 * 86400000;
  let open = 0, dueToday = 0, overdue = 0, doneWeek = 0, done = 0;
  for (const t of tasks) {
    if (t.status === 'cancelled') continue;
    if (isDone(t)) {
      done += 1;
      if (t.completedAt && new Date(t.completedAt).getTime() >= weekAgo) doneWeek += 1;
      continue;
    }
    open += 1;
    const key = dueKey(t);
    if (key === today) dueToday += 1;
    else if (key && key < today) overdue += 1;
  }
  const total = open + done;
  return { open, dueToday, overdue, doneWeek, done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

export const subtaskProgress = (t) => {
  const list = t.subtasks || [];
  const done = list.filter((s) => s.isDone).length;
  return { total: list.length, done, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
};

export const formatMinutes = (m) => {
  if (!m) return '';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
};
