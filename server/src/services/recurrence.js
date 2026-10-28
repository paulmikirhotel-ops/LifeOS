/**
 * Recurring-task helpers (pure functions, no database access).
 *
 * When a recurring task is completed, the next occurrence is created with a due date
 * that is one period after the previous due date — and always in the future, so completing
 * a daily task three days late does not create a task that is already overdue.
 */

export const RECURRENCE_TYPES = ['daily', 'weekly', 'monthly'];

export function isRecurring(recurrenceType) {
  return RECURRENCE_TYPES.includes(recurrenceType);
}

/** Add one period to a date (local time). Monthly keeps the day of month, clamped to month end. */
export function addPeriod(date, recurrenceType) {
  const d = new Date(date);
  if (recurrenceType === 'daily') {
    d.setDate(d.getDate() + 1);
  } else if (recurrenceType === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else if (recurrenceType === 'monthly') {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
  } else {
    throw new Error(`Unknown recurrence type: ${recurrenceType}`);
  }
  return d;
}

/**
 * Due date of the next occurrence.
 * @param {Date|string|null|undefined} dueDate  due date of the task that was just completed
 * @param {string} recurrenceType               'daily' | 'weekly' | 'monthly'
 * @param {Date} [completedAt]                  when it was completed (defaults to now)
 */
export function nextDueDate(dueDate, recurrenceType, completedAt = new Date()) {
  let next = addPeriod(dueDate ? new Date(dueDate) : completedAt, recurrenceType);
  // Skip periods that are already in the past (late completion). Bounded so bad data cannot loop.
  for (let i = 0; i < 400 && next <= completedAt; i += 1) {
    next = addPeriod(next, recurrenceType);
  }
  return next;
}

/** Fields copied from a completed recurring task to its next occurrence. */
export function buildNextOccurrence(task, completedAt = new Date()) {
  return {
    tenantId: task.tenantId,
    createdBy: task.createdBy,
    title: task.title,
    description: task.description,
    priority: task.priority,
    category: task.category,
    estimatedMinutes: task.estimatedMinutes,
    notes: task.notes,
    recurrenceType: task.recurrenceType,
    status: 'not_started',
    dueDate: nextDueDate(task.dueDate, task.recurrenceType, completedAt),
    subtasks: (task.subtasks || []).map((s) => ({ title: s.title, isDone: false })),
  };
}
