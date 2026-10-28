import { CalendarEvent, Task } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

/** Tenant-shared calendar events (daily/weekly/monthly views in the UI). */
export const CalendarService = {
  async list(user, { from, to }) {
    const filter = { tenantId: user.tenantId };
    if (from || to) {
      filter.startAt = {};
      if (from) filter.startAt.$gte = new Date(from);
      if (to) filter.startAt.$lte = new Date(`${to}T23:59:59.999Z`);
    }
    const items = await CalendarEvent.find(filter).sort({ startAt: 1 }).lean();
    return items.map((e) => ({ ...e, id: e._id.toString() }));
  },

  /** Open tasks with a due date in the range (widened by a day each side; the client buckets by local day). */
  async tasksDue(user, { from, to }) {
    if (!from || !to) return [];
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T23:59:59.999Z`);
    start.setUTCDate(start.getUTCDate() - 1);
    end.setUTCDate(end.getUTCDate() + 1);
    const items = await Task.find({
      tenantId: user.tenantId,
      status: { $nin: ['completed', 'cancelled'] },
      dueDate: { $gte: start, $lte: end },
    })
      .select('title priority status dueDate category')
      .sort({ dueDate: 1 })
      .limit(500)
      .lean();
    return items.map((t) => ({ ...t, id: t._id.toString() }));
  },

  async create(user, body) {
    const startAt = new Date(body.startAt);
    const endAt = body.endAt ? new Date(body.endAt) : null;
    if (Number.isNaN(startAt.getTime())) throw ApiError.badRequest('startAt must be a valid date');
    if (endAt && Number.isNaN(endAt.getTime())) throw ApiError.badRequest('endAt must be a valid date');
    if (endAt && endAt <= startAt) throw ApiError.badRequest('endAt must be after startAt');

    const event = await CalendarEvent.create({
      tenantId: user.tenantId,
      userId: user.id,
      title: body.title,
      type: body.type || 'personal',
      description: body.description,
      allDay: body.allDay === true,
      startAt,
      endAt,
    });
    return event.toObject();
  },

  async update(user, id, patch) {
    const data = { ...patch };
    if (data.startAt) {
      const d = new Date(data.startAt);
      if (Number.isNaN(d.getTime())) throw ApiError.badRequest('startAt must be a valid date');
      data.startAt = d;
    }
    if (data.endAt !== undefined) {
      if (data.endAt === null || data.endAt === '') {
        data.endAt = null;
      } else {
        const d = new Date(data.endAt);
        if (Number.isNaN(d.getTime())) throw ApiError.badRequest('endAt must be a valid date');
        data.endAt = d;
      }
    }
    delete data.tenantId;
    delete data.userId;

    const event = await CalendarEvent.findOneAndUpdate(
      { _id: id, tenantId: user.tenantId },
      { $set: data },
      { new: true, runValidators: true }
    );
    if (!event) throw ApiError.notFound('Event not found');
    return event.toObject();
  },

  async remove(user, id) {
    const result = await CalendarEvent.deleteOne({ _id: id, tenantId: user.tenantId });
    if (result.deletedCount === 0) throw ApiError.notFound('Event not found');
  },
};
