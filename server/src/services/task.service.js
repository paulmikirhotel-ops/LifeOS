import { Task, Tenant, ScheduleBlock } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { toObjectId } from '../utils/objectId.js';
import * as notificationService from './notification.service.js';

export async function list(user, query) {
  const { tenantId } = user;
  const { status, priority, category, search, dueFrom, dueTo } = query;
  let { page = 1, limit = 20 } = query;

  page = Math.max(1, parseInt(page));
  limit = Math.min(50, Math.max(1, parseInt(limit)));

  const filter = { tenantId };

  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (category) filter.category = category;
  if (search) filter.title = { $regex: search, $options: 'i' };

  if (dueFrom || dueTo) {
    filter.dueDate = {};
    if (dueFrom) filter.dueDate.$gte = new Date(dueFrom);
    if (dueTo) filter.dueDate.$lte = new Date(dueTo);
  }

  // To achieve "nulls last" in Mongoose/MongoDB efficiently with lean()
  // we use aggregation or a composite sort if possible.
  // Standard find doesn't support nulls last easily.
  const total = await Task.countDocuments(filter);
  const aggMatch = { ...filter, tenantId: toObjectId(tenantId) };
  const items = await Task.aggregate([
    { $match: aggMatch },
    {
      $addFields: {
        hasDueDate: { $cond: [{ $ifNull: ['$dueDate', false] }, 1, 0] },
      },
    },
    { $sort: { hasDueDate: -1, dueDate: 1, createdAt: -1 } },
    { $skip: (page - 1) * limit },
    { $limit: limit },
  ]);

  return { items, total, page, limit };
}

export async function todayList(user) {
  const { tenantId } = user;
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setUTCHours(23, 59, 59, 999);

  return Task.find({
    tenantId,
    $or: [
      { dueDate: { $gte: startOfDay, $lte: endOfDay } },
      { dueDate: { $exists: false }, status: { $ne: 'completed' } },
      { dueDate: null, status: { $ne: 'completed' } },
    ],
  })
    .sort({ priority: 1, createdAt: -1 })
    .lean();
}

export async function get(user, id) {
  const task = await Task.findOne({ _id: id, tenantId: user.tenantId }).lean();
  if (!task) throw ApiError.notFound('Task not found');
  return task;
}

export async function create(user, body) {
  const data = {
    ...body,
    tenantId: user.tenantId,
    createdBy: user.id,
  };

  if (data.subtasks) {
    data.subtasks = data.subtasks.map((s) => ({
      ...s,
      title: s.title?.trim(),
    }));
  }

  const task = await Task.create(data);
  notificationService.notify({
    tenantId: task.tenantId,
    userId: task.createdBy,
    type: 'task',
    module: 'task',
    title: 'Task created',
    message: `"${task.title}" has been created.`,
    relatedId: task._id,
    priority: 'low',
  });
  return task;
}

export async function update(user, id, patch) {
  const updateData = { ...patch };

  if (updateData.status === 'completed') {
    updateData.completedAt = new Date();
  }

  // Ensure tenantId and createdBy are not overwritten by patch
  delete updateData.tenantId;
  delete updateData.createdBy;

  const task = await Task.findOneAndUpdate(
    { _id: id, tenantId: user.tenantId },
    { $set: updateData },
    { new: true }
  ).lean();

  if (!task) throw ApiError.notFound('Task not found');

  if (task.status === 'completed') {
    notificationService.notify({
      tenantId: task.tenantId,
      userId: task.createdBy,
      type: 'task',
      module: 'task',
      title: 'Task completed',
      message: `Great job — "${task.title}" is done.`,
      relatedId: task._id,
      priority: 'low',
    });
  }

  return task;
}

export async function remove(user, id) {
  const result = await Task.deleteOne({ _id: id, tenantId: user.tenantId });
  if (result.deletedCount === 0) throw ApiError.notFound('Task not found');
  return { success: true };
}

export async function planSmart(user, body) {
  const { tenantId } = user;
  const task = await create(user, body);

  const date = body.date || new Date().toISOString().split('T')[0];
  const durationMin = Math.max(15, Math.min(480, parseInt(body.durationMin || 30)));

  const tenant = await Tenant.findById(tenantId).lean();
  const wh = tenant?.settings?.workingHours || {};
  const startMin = wh.startMin ?? 480;
  const endMin = wh.endMin ?? 1200;

  const blocks = await ScheduleBlock.find({ tenantId, date }).sort({ startMin: 1 }).lean();

  let suggestion = null;
  let cursor = startMin;

  for (const block of blocks) {
    if (block.startMin - cursor >= durationMin) {
      suggestion = { startMin: cursor, endMin: cursor + durationMin };
      break;
    }
    cursor = Math.max(cursor, block.endMin);
  }

  if (!suggestion && endMin - cursor >= durationMin) {
    suggestion = { startMin: cursor, endMin: cursor + durationMin };
  }

  return { task, suggestion };
}
