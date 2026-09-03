import { ScheduleBlock } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

export async function list(user, { from, to } = {}) {
  const { tenantId } = user;
  const today = new Date().toISOString().split('T')[0];

  const fromDate = from || today;
  const toDate = to || new Date(new Date(fromDate).getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return ScheduleBlock.find({
    tenantId,
    date: { $gte: fromDate, $lte: toDate },
  })
    .sort({ date: 1, startMin: 1 })
    .lean();
}

async function checkOverlap(tenantId, tenant, body, excludeId = null) {
  if (tenant.settings.allowOverlap || body.allowOverlap) return;

  const query = {
    tenantId,
    date: body.date,
    startMin: { $lt: body.endMin },
    endMin: { $gt: body.startMin },
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const overlaps = await ScheduleBlock.find(query).lean();
  if (overlaps.length > 0) {
    throw ApiError.conflict('Overlaps existing block(s)', {
      errors: [
        {
          field: 'startMin',
          message: `${overlaps[0].title} ${overlaps[0].startMin}-${overlaps[0].endMin}`,
        },
      ],
    });
  }
}

export async function create(user, tenant, body) {
  validateBlock(body);
  await checkOverlap(user.tenantId, tenant, body);

  return ScheduleBlock.create({
    ...body,
    tenantId: user.tenantId,
    userId: user.id,
  });
}

export async function update(user, tenant, id, patch) {
  // If date/startMin/endMin are changed, we need full data for overlap check
  let fullDoc = await ScheduleBlock.findOne({ _id: id, tenantId: user.tenantId }).lean();
  if (!fullDoc) throw ApiError.notFound('Schedule block not found');

  const merged = { ...fullDoc, ...patch };
  validateBlock(merged);
  await checkOverlap(user.tenantId, tenant, merged, id);

  const block = await ScheduleBlock.findOneAndUpdate(
    { _id: id, tenantId: user.tenantId },
    { $set: patch },
    { new: true }
  ).lean();

  return block;
}

export async function remove(user, id) {
  const result = await ScheduleBlock.deleteOne({ _id: id, tenantId: user.tenantId });
  if (result.deletedCount === 0) throw ApiError.notFound('Schedule block not found');
  return { success: true };
}

export async function availability(user, tenant, { date, durationMin }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw ApiError.badRequest('Invalid date format YYYY-MM-DD');
  }
  const dur = parseInt(durationMin);
  if (isNaN(dur) || dur < 10) throw ApiError.badRequest('Duration must be >= 10');

  const { startMin, endMin } = tenant.settings.defaultWorkingHours;
  const blocks = await ScheduleBlock.find({ tenantId: user.tenantId, date }).sort({ startMin: 1 }).lean();

  const gaps = [];
  let cursor = startMin;

  for (const block of blocks) {
    if (block.startMin - cursor >= dur) {
      gaps.push({ startMin: cursor, endMin: block.startMin });
    }
    cursor = Math.max(cursor, block.endMin);
  }

  if (endMin - cursor >= dur) {
    gaps.push({ startMin: cursor, endMin: endMin });
  }

  return gaps;
}

function validateBlock(body) {
  if (body.date && !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    throw ApiError.badRequest('Invalid date format YYYY-MM-DD');
  }
  if (body.startMin < 0 || body.startMin > 1439) {
    throw ApiError.badRequest('startMin must be 0..1439');
  }
  if (body.endMin <= body.startMin || body.endMin > 1440) {
    throw ApiError.badRequest('endMin must be startMin < endMin <= 1440');
  }
}
