import { ApiError } from '../utils/ApiError.js';
import { FocusSession } from '../models/index.js';
import { assertObjectId } from '../utils/objectId.js';

export async function start(user, { plannedMinutes, type, taskId }) {
  // Abandon any other running sessions
  await FocusSession.updateMany(
    { tenantId: user.tenantId, userId: user.id, status: 'running' },
    { status: 'abandoned', endedAt: new Date() }
  );

  const session = await FocusSession.create({
    tenantId: user.tenantId,
    userId: user.id,
    plannedMinutes,
    type: type || 'focus',
    taskId,
    status: 'running',
    startedAt: new Date(),
  });

  return session;
}

export async function action(user, id, { action: act }) {
  assertObjectId(id);
  const session = await FocusSession.findOne({ _id: id, tenantId: user.tenantId, userId: user.id });
  if (!session) throw ApiError.notFound();

  const now = new Date();

  if (act === 'pause') {
    if (session.status !== 'running') throw ApiError.badRequest('Session is not running');
    session.status = 'paused';
    session.pausedAt = now;
  } else if (act === 'resume') {
    if (session.status !== 'paused') throw ApiError.badRequest('Session is not paused');
    const pausedFor = now - session.pausedAt;
    session.pausedMs += pausedFor;
    session.status = 'running';
    session.pausedAt = null;
  } else if (act === 'complete') {
    if (!['running', 'paused'].includes(session.status)) throw ApiError.badRequest('Session cannot be completed');
    session.endedAt = now;
    session.status = 'completed';
    if (session.pausedAt) {
      session.pausedMs += now - session.pausedAt;
      session.pausedAt = null;
    }
  } else if (act === 'abandon') {
    session.endedAt = now;
    session.status = 'abandoned';
  } else {
    throw ApiError.badRequest('Invalid action');
  }

  await session.save();

  let actualSeconds = 0;
  if (session.status === 'completed' || session.status === 'abandoned') {
    actualSeconds = Math.max(0, Math.round((session.endedAt - session.startedAt - session.pausedMs) / 1000));
  }

  return { session, actualSeconds };
}

export async function list(user, { from, to }) {
  const query = {
    tenantId: user.tenantId,
    userId: user.id,
  };

  if (from || to) {
    query.startedAt = {};
    if (from) query.startedAt.$gte = new Date(from);
    if (to) query.startedAt.$lt = new Date(to);
  }

  const items = await FocusSession.find(query).sort({ startedAt: -1 }).lean();
  return { items, total: items.length };
}

export async function todaySummary(user) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const sessions = await FocusSession.find({
    tenantId: user.tenantId,
    userId: user.id,
    startedAt: { $gte: startOfToday },
    status: 'completed',
  }).lean();

  let focusSeconds = 0;
  let breaksMinutes = 0;

  sessions.forEach((s) => {
    const seconds = Math.max(0, Math.round((s.endedAt - s.startedAt - s.pausedMs) / 1000));
    if (s.type === 'focus') {
      focusSeconds += seconds;
    } else {
      breaksMinutes += Math.floor(seconds / 60);
    }
  });

  return { focusSeconds, breaksMinutes };
}
