/**
 * Pure logic for the Today page (morning briefing, evening review, weekly report).
 * No database access here, so everything in this file is unit-tested.
 */

const PRIORITY_WEIGHT = { urgent: 4, high: 3, medium: 2, low: 1 };

/**
 * Picks the tasks that matter most right now.
 * Order: overdue first, then due today, then by priority, then soonest due date; tasks with no
 * due date come last. Completed and cancelled tasks are ignored.
 */
export function pickTopPriorities(tasks, now = new Date(), limit = 3) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const bucket = (t) => {
    if (!t.dueDate) return 3;
    const due = new Date(t.dueDate);
    if (due < startOfToday) return 0; // overdue
    if (due < endOfToday) return 1; // due today
    return 2; // later
  };

  return (tasks || [])
    .filter((t) => t && !['completed', 'cancelled'].includes(t.status))
    .map((t) => ({ t, b: bucket(t) }))
    .sort((x, y) => {
      if (x.b !== y.b) return x.b - y.b;
      const pw = (PRIORITY_WEIGHT[y.t.priority] || 0) - (PRIORITY_WEIGHT[x.t.priority] || 0);
      if (pw !== 0) return pw;
      const dx = x.t.dueDate ? new Date(x.t.dueDate).getTime() : Infinity;
      const dy = y.t.dueDate ? new Date(y.t.dueDate).getTime() : Infinity;
      return dx - dy;
    })
    .slice(0, limit)
    .map(({ t, b }) => ({ ...t, urgency: ['overdue', 'today', 'later', 'none'][b] }));
}

const pad = (n) => String(n).padStart(2, '0');

/** Local 'YYYY-MM-DD'. */
export function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Monday-to-Sunday week containing `date` (local time).
 * `start` is Monday 00:00, `end` is the following Monday 00:00 (exclusive).
 */
export function weekRange(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const dow = (start.getDay() + 6) % 7; // Monday = 0
  start.setDate(start.getDate() - dow);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const lastDay = new Date(end);
  lastDay.setDate(lastDay.getDate() - 1);
  return { start, end, startStr: ymd(start), endStr: ymd(lastDay) };
}

/** Week range from a 'YYYY-MM-DD' string (any day inside the week); null when invalid. */
export function weekRangeFromString(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(str || ''))) return null;
  const d = new Date(`${str}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return weekRange(d);
}

export function previousWeek(range) {
  const d = new Date(range.start);
  d.setDate(d.getDate() - 7);
  return weekRange(d);
}

/** Percentage change from `prev` to `cur`; null when there is nothing to compare against. */
export function pctChange(cur, prev) {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

const hoursText = (min) => `${(Math.round((min / 60) * 10) / 10).toString()} h`;

/**
 * Plain, rule-based observations about a week. Works with no AI at all.
 * @param {object} cur   stats for this week
 * @param {object|null} prev   stats for the previous week (may be null)
 * @returns {string[]} at most 4 sentences, most useful first
 */
export function buildWeeklyInsights(cur, prev) {
  const out = [];
  if (!cur) return out;

  const done = cur.tasksCompleted || 0;
  const missed = cur.tasksMissed || 0;

  if (done + missed > 0) {
    const change = prev ? pctChange(done, prev.tasksCompleted || 0) : null;
    let line = `You completed ${done} task${done === 1 ? '' : 's'}`;
    if (change !== null && change !== 0) line += `, ${change > 0 ? 'up' : 'down'} ${Math.abs(change)}% on last week`;
    out.push(`${line}.`);
  } else {
    out.push('No tasks were due or completed this week.');
  }

  if (missed > 0) {
    out.push(`${missed} task${missed === 1 ? ' was' : 's were'} due and not finished. Review them and move or drop each one.`);
  }

  if (cur.habitSlots > 0) {
    const rate = Math.round((cur.habitCheckins / cur.habitSlots) * 100);
    const prevRate = prev && prev.habitSlots > 0 ? Math.round((prev.habitCheckins / prev.habitSlots) * 100) : null;
    let line = `Habit consistency was ${Math.min(rate, 100)}%`;
    if (prevRate !== null && rate !== prevRate) line += ` (${rate > prevRate ? 'up' : 'down'} from ${prevRate}%)`;
    out.push(`${line}.`);
  }

  if (cur.focusMinutes > 0) {
    out.push(`You focused for ${hoursText(cur.focusMinutes)} across ${cur.focusSessions || 0} session${cur.focusSessions === 1 ? '' : 's'}.`);
  }

  if (typeof cur.spend === 'number' && cur.spend > 0 && prev && typeof prev.spend === 'number' && prev.spend > 0) {
    const change = pctChange(cur.spend, prev.spend);
    if (change !== null && Math.abs(change) >= 10) {
      out.push(`Spending was ${change > 0 ? 'up' : 'down'} ${Math.abs(change)}% on last week.`);
    }
  }

  return out.slice(0, 4);
}

/** Next due date for a task moved to "tomorrow": same time of day when it had one, else 09:00. */
export function tomorrowFor(task, now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  if (task?.dueDate) {
    const prev = new Date(task.dueDate);
    d.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
  } else {
    d.setHours(9, 0, 0, 0);
  }
  return d;
}

/** Time-of-day greeting from an hour 0-23. */
export function greetingFor(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
