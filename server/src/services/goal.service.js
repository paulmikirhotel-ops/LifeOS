import { ApiError } from '../utils/ApiError.js';
import { Goal, Task, Habit, HabitLog } from '../models/index.js';
import { goalProgress, goalHealth, idleDays, latestDate, consistency, neglectCheck } from './goalLogic.js';
import { assertObjectId, toObjectId } from '../utils/objectId.js';
import * as notificationService from './notification.service.js';

export async function list(user, { status, type }) {
  const query = { tenantId: user.tenantId };
  if (status) query.status = status;
  if (type) query.type = type;

  const items = await Goal.find(query).sort({ createdAt: -1 }).lean();

  // Linked task / habit counts for the cards (two grouped queries, not one per goal).
  const ids = items.map((g) => g._id);
  const [taskCounts, habitCounts] = ids.length
    ? await Promise.all([
        Task.aggregate([
          { $match: { tenantId: toObjectId(user.tenantId), goalId: { $in: ids }, status: { $ne: 'cancelled' } } },
          { $group: { _id: '$goalId', total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } },
        ]),
        Habit.aggregate([
          { $match: { tenantId: toObjectId(user.tenantId), goalId: { $in: ids }, isArchived: false } },
          { $group: { _id: '$goalId', total: { $sum: 1 } } },
        ]),
      ])
    : [[], []];
  const tMap = new Map(taskCounts.map((r) => [String(r._id), r]));
  const hMap = new Map(habitCounts.map((r) => [String(r._id), r]));
  items.forEach((g) => {
    const t = tMap.get(String(g._id));
    g.linked = { tasks: t?.total || 0, tasksDone: t?.done || 0, habits: hMap.get(String(g._id))?.total || 0 };
  });
  return { items, total: items.length };
}

/** Throws 400/404 when goalId is set but is not a goal in this workspace. null/undefined pass. */
export async function assertGoalInTenant(user, goalId) {
  if (goalId === undefined || goalId === null || goalId === '') return;
  assertObjectId(goalId, 'goalId');
  const exists = await Goal.exists({ _id: goalId, tenantId: user.tenantId });
  if (!exists) throw ApiError.badRequest('Goal not found in this workspace');
}

/**
 * Recalculates a goal's progress from its milestones and linked tasks.
 * Best effort: never throws, so a task save can never fail because of the goal.
 * Completed and cancelled goals are left alone.
 */
export async function recompute(tenantId, goalId) {
  try {
    if (!goalId) return null;
    const goal = await Goal.findOne({ _id: goalId, tenantId });
    if (!goal || goal.status !== 'active') return null;
    const tasks = await Task.find({ tenantId, goalId }).select('status').lean();
    const { progress, auto } = goalProgress({ milestones: goal.milestones, tasks, manualProgress: goal.progress });
    if (auto && progress !== goal.progress) {
      await Goal.updateOne({ _id: goal._id }, { $set: { progress } });
    }
    return progress;
  } catch (err) {
    console.error('goal recompute failed', err.message);
    return null;
  }
}

/** One goal with everything linked to it, plus its health. */
export async function overview(user, id) {
  assertObjectId(id);
  const goal = await Goal.findOne({ _id: id, tenantId: user.tenantId }).lean();
  if (!goal) throw ApiError.notFound();

  const [tasks, habits] = await Promise.all([
    Task.find({ tenantId: user.tenantId, goalId: id })
      .select('title status priority dueDate completedAt updatedAt milestoneId')
      .sort({ status: 1, dueDate: 1 })
      .lean(),
    Habit.find({ tenantId: user.tenantId, goalId: id, isArchived: false }).select('name color targetPerDay userId').lean(),
  ]);

  const now = new Date();
  const since = new Date(now.getTime() - 14 * 86400000);
  const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;
  const logs = habits.length
    ? await HabitLog.find({ tenantId: user.tenantId, habitId: { $in: habits.map((h) => h._id) }, date: { $gte: sinceStr } })
        .select('habitId date updatedAt')
        .lean()
    : [];

  const habitRows = habits.map((h) => {
    const mine = logs.filter((l) => String(l.habitId) === String(h._id));
    return { ...h, consistency: consistency(mine.map((l) => l.date), 14) };
  });

  const calc = goalProgress({ milestones: goal.milestones, tasks, manualProgress: goal.progress });
  const lastActivityAt = latestDate([
    ...tasks.map((t) => t.completedAt),
    ...logs.map((l) => l.updatedAt),
  ]);
  const health = goalHealth({
    goal,
    progress: goal.status === 'completed' ? 100 : calc.progress,
    itemCount: calc.total + habits.length,
    lastActivityAt: lastActivityAt || goal.createdAt,
    now,
  });

  return {
    goal: { ...goal, progress: goal.status === 'completed' ? 100 : calc.progress },
    tasks,
    habits: habitRows,
    summary: {
      autoProgress: calc.auto,
      done: calc.done,
      total: calc.total,
      health,
      idleDays: idleDays(lastActivityAt, now),
    },
  };
}

export async function create(user, body) {
  if (body.milestones) {
    if (!Array.isArray(body.milestones) || body.milestones.length > 50) {
      throw ApiError.badRequest('Milestones must be an array (max 50)');
    }
    body.milestones.forEach((m, idx) => {
      if (!m.title?.trim()) throw ApiError.badRequest(`Milestone ${idx} title required`);
    });
  }

  const goal = await Goal.create({
    ...body,
    tenantId: user.tenantId,
    createdBy: user.id,
  });

  notificationService.notify({
    tenantId: goal.tenantId,
    userId: goal.createdBy,
    type: 'goal',
    module: 'goal',
    title: 'Goal created',
    message: `"${goal.title}" is now on your radar.`,
    relatedId: goal._id,
    priority: 'low',
  });

  return goal;
}

export async function update(user, id, patch) {
  assertObjectId(id);
  const goal = await Goal.findOne({ _id: id, tenantId: user.tenantId });
  if (!goal) throw ApiError.notFound();

  const prevStatus = goal.status;

  if (patch.milestones) {
    if (!Array.isArray(patch.milestones) || patch.milestones.length > 50) {
      throw ApiError.badRequest('Milestones must be an array (max 50)');
    }
    patch.milestones.forEach((m, idx) => {
      if (!m.title?.trim()) throw ApiError.badRequest(`Milestone ${idx} title required`);
    });
    goal.milestones = patch.milestones;
  }

  const fields = ['title', 'description', 'type', 'targetDate', 'status', 'progress', 'relatedTaskIds'];
  fields.forEach((f) => {
    if (patch[f] !== undefined) goal[f] = patch[f];
  });

  if (goal.status === 'completed') {
    goal.progress = 100;
  }

  await goal.save();
  if (patch.milestones) await recompute(goal.tenantId, goal._id);

  if (goal.status === 'completed' && prevStatus !== 'completed') {
    notificationService.notify({
      tenantId: goal.tenantId,
      userId: goal.createdBy,
      type: 'goal',
      module: 'goal',
      title: 'Goal completed',
      message: `Congratulations — "${goal.title}" is complete!`,
      relatedId: goal._id,
      priority: 'normal',
    });
  }

  return goal;
}

export async function remove(user, id) {
  assertObjectId(id);
  const result = await Goal.deleteOne({ _id: id, tenantId: user.tenantId });
  if (result.deletedCount === 0) throw ApiError.notFound();
  // Unlink, never delete, the work that was attached to it.
  await Promise.all([
    Task.updateMany({ tenantId: user.tenantId, goalId: id }, { $unset: { goalId: 1, milestoneId: 1 } }),
    Habit.updateMany({ tenantId: user.tenantId, goalId: id }, { $unset: { goalId: 1 } }),
  ]);
}

/**
 * Goals that have gone quiet: active, have linked tasks or habits, and nothing done for 7+ days.
 * `filter` narrows the goals (e.g. { tenantId } for the briefing); the scheduler passes {} to scan all.
 * Three grouped queries in total, whatever the number of goals.
 * @returns {Promise<Array<{goal:object, idleDays:number, lastActivityAt:Date|null}>>} most idle first
 */
export async function findIdleGoals(filter = {}, now = new Date(), limit = 500) {
  const goals = await Goal.find({ ...filter, status: 'active' })
    .select('title tenantId createdBy targetDate status createdAt')
    .limit(limit)
    .lean();
  if (!goals.length) return [];
  const ids = goals.map((g) => g._id);

  const [taskRows, habits] = await Promise.all([
    Task.aggregate([
      { $match: { goalId: { $in: ids }, status: { $ne: 'cancelled' } } },
      { $group: { _id: '$goalId', count: { $sum: 1 }, lastDone: { $max: '$completedAt' } } },
    ]),
    Habit.find({ goalId: { $in: ids }, isArchived: false }).select('goalId').lean(),
  ]);
  const habitToGoal = new Map(habits.map((h) => [String(h._id), String(h.goalId)]));
  const logRows = habits.length
    ? await HabitLog.aggregate([
        { $match: { habitId: { $in: habits.map((h) => h._id) } } },
        { $group: { _id: '$habitId', last: { $max: '$updatedAt' } } },
      ])
    : [];

  const info = new Map(goals.map((g) => [String(g._id), { count: 0, dates: [] }]));
  taskRows.forEach((r) => {
    const i = info.get(String(r._id));
    if (i) { i.count += r.count; i.dates.push(r.lastDone); }
  });
  habits.forEach((h) => { const i = info.get(String(h.goalId)); if (i) i.count += 1; });
  logRows.forEach((r) => {
    const gid = habitToGoal.get(String(r._id));
    if (gid) info.get(gid)?.dates.push(r.last);
  });

  const out = [];
  for (const g of goals) {
    const i = info.get(String(g._id));
    const lastActivityAt = latestDate(i.dates);
    const { idle, days } = neglectCheck({ goal: g, itemCount: i.count, lastActivityAt, now });
    if (idle) out.push({ goal: g, idleDays: days, lastActivityAt });
  }
  return out.sort((a, b) => b.idleDays - a.idleDays);
}
