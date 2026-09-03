import { DailyNote } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { hasPermission } from '../config/permissions.js';

export async function list(user, query) {
  const { tenantId, id: userId, permissions } = user;
  const { type = 'journal', from, to, tag, search } = query;
  let { page = 1, limit = 20 } = query;

  page = Math.max(1, parseInt(page));
  limit = Math.min(50, Math.max(1, parseInt(limit)));

  const filter = { tenantId, type };

  if (from || to) {
    filter.entryDate = {};
    if (from) filter.entryDate.$gte = new Date(from);
    if (to) filter.entryDate.$lte = new Date(to);
  }

  if (tag) filter.tags = tag;
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { content: { $regex: search, $options: 'i' } },
    ];
  }

  const hasPrivatePerm = hasPermission(permissions, 'journal.private');
  if (!hasPrivatePerm) {
    const visibilityFilter = {
      $or: [{ isPrivate: false }, { authorId: userId }],
    };
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, visibilityFilter];
      delete filter.$or;
    } else {
      filter.$or = visibilityFilter.$or;
    }
  }

  const total = await DailyNote.countDocuments(filter);
  const items = await DailyNote.find(filter)
    .sort({ entryDate: -1, createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return { items, total, page, limit };
}

export async function get(user, id) {
  const { tenantId, id: userId, permissions } = user;
  const note = await DailyNote.findOne({ _id: id, tenantId }).lean();

  if (!note) throw ApiError.notFound('Note not found');

  const hasPrivatePerm = hasPermission(permissions, 'journal.private');
  if (note.isPrivate && note.authorId.toString() !== userId && !hasPrivatePerm) {
    throw ApiError.notFound('Note not found');
  }

  return note;
}

export async function create(user, body) {
  const { type = 'journal' } = body;
  const data = {
    ...body,
    tenantId: user.tenantId,
    authorId: user.id,
  };

  if (type === 'myday' || type === 'review') {
    data.isPrivate = true;
  } else if (data.isPrivate === undefined) {
    data.isPrivate = true;
  }

  return DailyNote.create(data);
}

export async function update(user, id, patch) {
  const { tenantId, id: userId, permissions } = user;
  const existing = await DailyNote.findOne({ _id: id, tenantId }).lean();
  if (!existing) throw ApiError.notFound('Note not found');

  const hasPrivatePerm = hasPermission(permissions, 'journal.private');
  const isAuthor = existing.authorId.toString() === userId;

  if (existing.isPrivate && !isAuthor && !hasPrivatePerm) {
    throw ApiError.notFound('Note not found');
  }

  // Ownership gate for modifications
  if (!isAuthor && !hasPrivatePerm) {
    throw ApiError.forbidden('Cannot modify other users notes');
  }

  if (patch.isPrivate !== undefined && !isAuthor && !hasPrivatePerm) {
    throw ApiError.notFound('Note not found');
  }

  const updated = await DailyNote.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: patch },
    { new: true }
  ).lean();

  return updated;
}

export async function remove(user, id) {
  const { tenantId, id: userId, permissions } = user;
  const existing = await DailyNote.findOne({ _id: id, tenantId }).lean();
  if (!existing) throw ApiError.notFound('Note not found');

  const hasPrivatePerm = hasPermission(permissions, 'journal.private');
  const isAuthor = existing.authorId.toString() === userId;

  if (!isAuthor && !hasPrivatePerm) {
    throw ApiError.notFound('Note not found');
  }

  await DailyNote.deleteOne({ _id: id, tenantId });
  return { success: true };
}

export async function daySummary(user, { date }) {
  const { tenantId, id: userId } = user;
  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);

  return DailyNote.find({
    tenantId,
    authorId: userId,
    entryDate: { $gte: startOfDay, $lte: endOfDay },
    type: { $in: ['myday', 'review', 'journal'] },
  })
    .sort({ type: 1, createdAt: -1 })
    .lean();
}
