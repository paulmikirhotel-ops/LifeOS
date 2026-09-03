import { ApiError } from '../utils/ApiError.js';
import { Goal } from '../models/index.js';
import { assertObjectId } from '../utils/objectId.js';
import * as notificationService from './notification.service.js';

export async function list(user, { status, type }) {
  const query = { tenantId: user.tenantId };
  if (status) query.status = status;
  if (type) query.type = type;

  const items = await Goal.find(query).sort({ createdAt: -1 }).lean();
  return { items, total: items.length };
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
}
