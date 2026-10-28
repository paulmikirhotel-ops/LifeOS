/**
 * Keeps meeting action items and Tasks in step (pure helpers).
 * Action items use: pending | in_progress | completed | cancelled.
 * Tasks use: not_started | in_progress | completed | cancelled | postponed.
 */
export function actionStatusForTask(taskStatus) {
  switch (taskStatus) {
    case 'completed':
    case 'in_progress':
    case 'cancelled':
      return taskStatus;
    case 'not_started':
    case 'postponed':
      return 'pending';
    default:
      return null; // unknown value: leave the action item alone
  }
}

/** The ActionItem fields to update for a task patch; null when nothing relevant changed. */
export function actionPatchForTaskPatch(patch = {}) {
  const set = {};
  if (patch.status !== undefined) {
    const s = actionStatusForTask(patch.status);
    if (s) set.status = s;
  }
  if (patch.dueDate !== undefined) set.deadline = patch.dueDate || null;
  if (patch.priority !== undefined) set.priority = patch.priority;
  return Object.keys(set).length ? set : null;
}
