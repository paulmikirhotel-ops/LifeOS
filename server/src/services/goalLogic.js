/**
 * Pure logic for the Goal Engine (no database access, fully unit-tested).
 *
 * Progress = finished items ÷ all items, where items are:
 *   - the goal's milestones (done / not done)
 *   - tasks linked to the goal (completed / not completed), cancelled tasks ignored
 * With no items at all, the manually set progress is kept.
 */

const clampPct = (n) => Math.min(100, Math.max(0, Math.round(n)));

export function goalProgress({ milestones = [], tasks = [], manualProgress = 0 } = {}) {
  const liveTasks = tasks.filter((t) => t && t.status !== 'cancelled');
  const total = milestones.length + liveTasks.length;
  if (total === 0) return { progress: clampPct(manualProgress), auto: false, done: 0, total: 0 };
  const done = milestones.filter((m) => m.isDone).length + liveTasks.filter((t) => t.status === 'completed').length;
  return { progress: clampPct((done / total) * 100), auto: true, done, total };
}

const DAY = 86400000;
export const IDLE_DAYS = 7;

/**
 * Health of a goal: 'done' | 'cancelled' | 'no_plan' | 'overdue' | 'slipping' | 'on_track'.
 *  - overdue: target date passed and not complete
 *  - slipping: no activity for 7+ days, or progress is behind the time elapsed by 25+ points
 *  - no_plan: nothing linked yet (no milestones, tasks or habits)
 */
export function goalHealth({ goal, progress, itemCount, lastActivityAt, now = new Date() }) {
  if (goal.status === 'completed') return 'done';
  if (goal.status === 'cancelled') return 'cancelled';
  if (goal.targetDate && new Date(goal.targetDate) < now) return 'overdue';
  if (!itemCount) return 'no_plan';

  const idle = idleDays(lastActivityAt, now);
  if (idle !== null && idle >= IDLE_DAYS) return 'slipping';

  if (goal.targetDate && goal.createdAt) {
    const start = new Date(goal.createdAt).getTime();
    const end = new Date(goal.targetDate).getTime();
    if (end > start) {
      const elapsed = Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
      if (elapsed * 100 - progress >= 25) return 'slipping';
    }
  }
  return 'on_track';
}

/** Whole days since the last activity; null when there never was any. */
export function idleDays(lastActivityAt, now = new Date()) {
  if (!lastActivityAt) return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(lastActivityAt).getTime()) / DAY));
}

/** Most recent date among the given values (Date|string|null). */
export function latestDate(values) {
  let best = null;
  for (const v of values) {
    if (!v) continue;
    const t = new Date(v).getTime();
    if (!Number.isNaN(t) && (best === null || t > best)) best = t;
  }
  return best === null ? null : new Date(best);
}

/** Habit consistency over the last `days` days: share of days with at least one check-in. */
export function consistency(logDates, days = 14) {
  const set = new Set(logDates);
  return Math.min(100, Math.round((set.size / Math.max(days, 1)) * 100));
}

/**
 * Is an active goal being neglected? It needs something to neglect (linked tasks or habits),
 * no target-date overrun (that has its own alert) and IDLE_DAYS or more without activity.
 * Returns { idle: boolean, days: number|null }.
 */
export function neglectCheck({ goal, itemCount, lastActivityAt, now = new Date() }) {
  const days = idleDays(lastActivityAt || goal.createdAt, now);
  const overdue = goal.targetDate && new Date(goal.targetDate) < now;
  const idle = goal.status === 'active' && !overdue && itemCount > 0 && days !== null && days >= IDLE_DAYS;
  return { idle, days };
}

/** Local 'YYYY-MM-DD' of a date: one alert per idle stretch is keyed on the last activity day. */
export function dayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
