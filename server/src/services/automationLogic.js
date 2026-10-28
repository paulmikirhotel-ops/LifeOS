/**
 * Pure logic for the built-in automations (no database access, unit-tested).
 */

const pad = (n) => String(n).padStart(2, '0');

/** Local 'YYYY-MM-DD'. */
export function ymdLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The calendar day before a 'YYYY-MM-DD' string (noon avoids daylight-saving edges). */
export function dayBefore(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return ymdLocal(new Date(y, m - 1, d - 1, 12));
}

/**
 * Length of the run of consecutive days that ends yesterday, for a habit that has NOT been done
 * today. Returns 0 when yesterday was missed, or when today is already done (nothing is at risk).
 */
export function streakAtRisk(logDates, today) {
  const set = new Set(logDates);
  if (set.has(today)) return 0;
  let day = dayBefore(today);
  let run = 0;
  // Bounded so bad data can never loop.
  while (set.has(day) && run < 1000) {
    run += 1;
    day = dayBefore(day);
  }
  return run;
}

export const STREAK_MIN = 3;
export const PILE_MIN = 5;

/** "You have 7 overdue tasks, the oldest 12 days late." */
export function pileMessage(count, oldestDueDate, now = new Date()) {
  const days = oldestDueDate ? Math.max(0, Math.floor((now.getTime() - new Date(oldestDueDate).getTime()) / 86400000)) : 0;
  const tail = days >= 1 ? `, the oldest ${days} day${days === 1 ? '' : 's'} late` : '';
  return `You have ${count} overdue tasks${tail}. Take two minutes to reschedule or drop the ones that no longer matter.`;
}

/** Evening window for the streak nudge: 18:00 to 21:59 server time. */
export function inStreakWindow(now) {
  return now.getHours() >= 18 && now.getHours() < 22;
}

/** Overdue nudge only during the day, so it never lands in the middle of the night. */
export function inPileWindow(now) {
  return now.getHours() >= 9 && now.getHours() < 20;
}
