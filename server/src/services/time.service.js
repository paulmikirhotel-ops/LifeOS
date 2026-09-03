import { ApiError } from '../utils/ApiError.js';
import { TimeEntry } from '../models/index.js';
import { assertObjectId } from '../utils/objectId.js';

export async function list(user, { from, to }) {
  const query = {
    tenantId: user.tenantId,
    userId: user.id,
  };

  const startDate = from ? new Date(from) : new Date();
  if (!from) startDate.setHours(0, 0, 0, 0);

  const endDate = to ? new Date(to) : new Date(startDate);
  if (!to) endDate.setDate(endDate.getDate() + 1);

  query.startedAt = { $gte: startDate, $lt: endDate };

  const items = await TimeEntry.find(query).sort({ startedAt: -1 }).lean();
  return { items, total: items.length };
}

export async function create(user, body) {
  if (body.startedAt && body.endedAt && new Date(body.endedAt) <= new Date(body.startedAt)) {
    throw ApiError.badRequest('End time must be after start time');
  }

  const entry = await TimeEntry.create({
    ...body,
    tenantId: user.tenantId,
    userId: user.id,
  });

  return entry;
}

export async function update(user, id, patch) {
  assertObjectId(id);
  const entry = await TimeEntry.findOne({ _id: id, tenantId: user.tenantId, userId: user.id });
  if (!entry) throw ApiError.notFound();

  const allowed = ['endedAt', 'activityType', 'description'];
  Object.keys(patch).forEach((key) => {
    if (allowed.includes(key)) entry[key] = patch[key];
  });

  if (entry.startedAt && entry.endedAt && entry.endedAt <= entry.startedAt) {
    throw ApiError.badRequest('End time must be after start time');
  }

  await entry.save();
  return entry;
}

export async function remove(user, id) {
  assertObjectId(id);
  const result = await TimeEntry.deleteOne({ _id: id, tenantId: user.tenantId, userId: user.id });
  if (result.deletedCount === 0) throw ApiError.notFound();
}

export async function summary(user, { from, to }) {
  const query = {
    tenantId: user.tenantId,
    userId: user.id,
    endedAt: { $exists: true, $ne: null },
  };

  if (from || to) {
    query.startedAt = {};
    if (from) query.startedAt.$gte = new Date(from);
    if (to) query.startedAt.$lt = new Date(to);
  }

  const entries = await TimeEntry.find(query).lean();

  let totalMinutes = 0;
  const byType = {};

  entries.forEach((e) => {
    const diffMs = e.endedAt - e.startedAt;
    const mins = Math.max(0, Math.floor(diffMs / 60000));
    totalMinutes += mins;
    byType[e.activityType] = (byType[e.activityType] || 0) + mins;
  });

  return { totalMinutes, byType };
}
