/**
 * Shared scoring helpers (pure functions, no database access).
 *
 * One productivity formula for the whole app — the dashboard and the analytics
 * dashboard both call productivityScore(), so a user never sees two different
 * "productivity" numbers.
 *
 *   score = 100 × Σ(weight × ratio) ÷ Σ(weight)   over the components that have data
 *
 *   tasks   50%   completed ÷ (completed + missed)
 *   focus   30%   focus minutes ÷ target (default 7 h per week, scaled to the window)
 *   habits  20%   habit check-ins ÷ (active habits × days), capped at 100%
 *
 * A component with no data (no tasks due, no focus time, no habits) is left out and the
 * remaining weights are rescaled, so nobody is penalised for a module they do not use.
 */

export const WEIGHTS = { tasks: 0.5, focus: 0.3, habits: 0.2 };
export const DEFAULT_FOCUS_TARGET_MINUTES_PER_WEEK = 7 * 60;

const clamp01 = (n) => Math.min(1, Math.max(0, n));

/** Minutes of focus in one finished session (pauses excluded). */
export function focusMinutesOf(session) {
  if (!session?.startedAt || !session?.endedAt) return 0;
  const ms = new Date(session.endedAt) - new Date(session.startedAt) - (session.pausedMs || 0);
  return Math.max(0, Math.round(ms / 60000));
}

/**
 * @param {object} input
 * @param {number} input.completed      tasks completed in the window
 * @param {number} input.missed         tasks that were due in the window and were not done
 * @param {number} input.focusMinutes   total focus minutes in the window
 * @param {number} input.habitCheckins  habit check-ins in the window
 * @param {number} input.activeHabits   number of active (non-archived) habits
 * @param {number} input.days           length of the window in days
 * @param {number} [input.focusTargetMinutesPerWeek]
 * @returns {{score:number, hasData:boolean, breakdown:{taskRate:number, focusRatio:number, habitRatio:number}}}
 */
export function productivityScore({
  completed = 0,
  missed = 0,
  focusMinutes = 0,
  habitCheckins = 0,
  activeHabits = 0,
  days = 7,
  focusTargetMinutesPerWeek = DEFAULT_FOCUS_TARGET_MINUTES_PER_WEEK,
} = {}) {
  const parts = [];
  const breakdown = { taskRate: 0, focusRatio: 0, habitRatio: 0 };

  const taskTotal = completed + missed;
  if (taskTotal > 0) {
    breakdown.taskRate = clamp01(completed / taskTotal);
    parts.push([WEIGHTS.tasks, breakdown.taskRate]);
  }

  if (focusMinutes > 0) {
    const target = Math.max(1, (focusTargetMinutesPerWeek * Math.max(days, 1)) / 7);
    breakdown.focusRatio = clamp01(focusMinutes / target);
    parts.push([WEIGHTS.focus, breakdown.focusRatio]);
  }

  if (activeHabits > 0) {
    breakdown.habitRatio = clamp01(habitCheckins / (activeHabits * Math.max(days, 1)));
    parts.push([WEIGHTS.habits, breakdown.habitRatio]);
  }

  if (parts.length === 0) return { score: 0, hasData: false, breakdown };

  const weightSum = parts.reduce((s, [w]) => s + w, 0);
  const weighted = parts.reduce((s, [w, r]) => s + w * r, 0);
  return { score: Math.round((100 * weighted) / weightSum), hasData: true, breakdown };
}
