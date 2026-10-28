import mongoose from 'mongoose';
import {
  Task,
  CalendarEvent,
  Goal,
  Habit,
  HabitLog,
  Meeting,
} from '../models/index.js';
import { sendDueDigests } from './digest.service.js';
import * as goalService from './goal.service.js';
import { dayKey } from './goalLogic.js';
import { weekRange } from './briefingLogic.js';
import { ymdLocal, dayBefore, streakAtRisk, STREAK_MIN, PILE_MIN, pileMessage, inStreakWindow, inPileWindow } from './automationLogic.js';
import * as notificationService from './notification.service.js';
import { notifyMeeting, humanizeMinutes } from './meetingNotify.service.js';

/**
 * In-process reminder scheduler.
 *
 * Runs a lightweight tick every 60s while the server is up. Every reminder is
 * deduplicated with a stable dedupeKey (unique sparse index), so server
 * restarts, page refreshes and repeated ticks can never create duplicates.
 *
 * Notes:
 * - Server-local time is used (the rest of the app uses server-local days).
 * - Works on a single Node instance. On multi-instance deployments the unique
 *   dedupeKey index still prevents duplicate notifications.
 */

const TICK_MS = 60 * 1000;
const DUE_SOON_WINDOW_MS = 60 * 60 * 1000; // tasks due within 60 min
const EVENT_WINDOW_MS = 30 * 60 * 1000; // events starting within 30 min
const GOAL_WINDOW_MS = 24 * 60 * 60 * 1000; // goal deadlines within 24 h

let timer = null;
let running = false;
let lastCleanupDate = null;

function fmtTime(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function remindTaskDeadlines(now) {
  const soon = new Date(now.getTime() + DUE_SOON_WINDOW_MS);

  const dueSoon = await Task.find({
    status: { $nin: ['completed', 'cancelled'] },
    dueDate: { $gt: now, $lte: soon },
  })
    .select('title tenantId createdBy dueDate')
    .lean();

  for (const task of dueSoon) {
    await notificationService.createNotification({
      tenantId: task.tenantId,
      userId: task.createdBy,
      type: 'reminder',
      module: 'task',
      title: 'Task due soon',
      message: `"${task.title}" is due at ${fmtTime(task.dueDate)}.`,
      relatedId: task._id,
      priority: 'high',
      dedupeKey: `task-due:${task._id}`,
    });
  }

  const overdue = await Task.find({
    status: { $in: ['not_started', 'in_progress'] },
    dueDate: { $lt: now },
  })
    .select('title tenantId createdBy dueDate')
    .lean();

  for (const task of overdue) {
    await notificationService.createNotification({
      tenantId: task.tenantId,
      userId: task.createdBy,
      type: 'reminder',
      module: 'task',
      title: 'Task overdue',
      message: `"${task.title}" was due ${fmtDate(task.dueDate)}.`,
      relatedId: task._id,
      priority: 'high',
      dedupeKey: `task-overdue:${task._id}`,
    });
  }
}

async function remindCalendarEvents(now) {
  const soon = new Date(now.getTime() + EVENT_WINDOW_MS);
  // Meeting events get configurable reminders from remindMeetings() instead.
  const events = await CalendarEvent.find({ startAt: { $gt: now, $lte: soon }, type: { $ne: 'meeting' } })
    .select('title tenantId userId startAt')
    .lean();

  for (const event of events) {
    await notificationService.createNotification({
      tenantId: event.tenantId,
      userId: event.userId,
      type: 'reminder',
      module: 'calendar',
      title: 'Event starting soon',
      message: `"${event.title}" starts at ${fmtTime(event.startAt)}.`,
      relatedId: event._id,
      priority: 'normal',
      dedupeKey: `calendar-start:${event._id}`,
    });
  }
}

/**
 * "This goal has gone quiet": linked work exists but nothing was done for 7+ days.
 * One alert per quiet stretch: the key includes the last activity day, so it fires again only
 * after the goal has been active and then gone quiet again.
 */
export async function remindIdleGoals(now) {
  const idle = await goalService.findIdleGoals({}, now);
  for (const { goal, idleDays: days, lastActivityAt } of idle) {
    await notificationService.createNotification({
      tenantId: goal.tenantId,
      userId: goal.createdBy,
      type: 'reminder',
      module: 'goal',
      title: 'A goal has gone quiet',
      message: `"${goal.title}" has had no progress for ${days} days. Pick one small next step.`,
      relatedId: goal._id,
      priority: 'normal',
      dedupeKey: `goal-idle:${goal._id}:${dayKey(lastActivityAt || goal.createdAt)}`,
    });
  }
}

/**
 * Built-in automation: "keep your streak". In the evening, a habit that has a streak of 3+ days
 * and has not been done today gets one nudge. Once per habit per day (dedupeKey).
 */
export async function remindStreaksAtRisk(now) {
  if (!inStreakWindow(now)) return;
  const today = ymdLocal(now);
  const yesterday = dayBefore(today);

  const [doneToday, doneYesterday] = await Promise.all([
    HabitLog.distinct('habitId', { date: today }),
    HabitLog.distinct('habitId', { date: yesterday }),
  ]);
  const doneTodaySet = new Set(doneToday.map(String));
  const candidates = doneYesterday.filter((id) => !doneTodaySet.has(String(id)));
  if (!candidates.length) return;

  const habits = await Habit.find({ _id: { $in: candidates }, isArchived: { $ne: true } })
    .select('name tenantId userId')
    .limit(500)
    .lean();
  if (!habits.length) return;

  const since = ymdLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90));
  const logs = await HabitLog.find({ habitId: { $in: habits.map((h) => h._id) }, date: { $gte: since } })
    .select('habitId date')
    .lean();
  const byHabit = new Map();
  logs.forEach((l) => {
    const k = String(l.habitId);
    if (!byHabit.has(k)) byHabit.set(k, []);
    byHabit.get(k).push(l.date);
  });

  for (const habit of habits) {
    const run = streakAtRisk(byHabit.get(String(habit._id)) || [], today);
    if (run < STREAK_MIN) continue;
    await notificationService.createNotification({
      tenantId: habit.tenantId,
      userId: habit.userId,
      type: 'reminder',
      module: 'habit',
      title: `Keep your ${run}-day streak`,
      message: `You have done "${habit.name}" ${run} days in a row. Do it today to keep it going.`,
      relatedId: habit._id,
      priority: 'normal',
      dedupeKey: `habit-streak:${habit._id}:${today}`,
    });
  }
}

/**
 * Built-in automation: overdue pile-up. When one person has 5+ overdue open tasks, send ONE
 * summary a week instead of leaving them to wade through each task alert.
 */
export async function remindOverduePileUp(now) {
  if (!inPileWindow(now)) return;
  const weekKey = weekRange(now).startStr;

  const rows = await Task.aggregate([
    { $match: { status: { $in: ['not_started', 'in_progress', 'postponed'] }, dueDate: { $lt: now } } },
    { $group: { _id: { tenantId: '$tenantId', userId: '$createdBy' }, count: { $sum: 1 }, oldest: { $min: '$dueDate' } } },
    { $match: { count: { $gte: PILE_MIN } } },
    { $limit: 1000 },
  ]);

  for (const r of rows) {
    await notificationService.createNotification({
      tenantId: r._id.tenantId,
      userId: r._id.userId,
      type: 'reminder',
      module: 'task',
      title: 'Overdue tasks are piling up',
      message: pileMessage(r.count, r.oldest, now),
      priority: 'normal',
      dedupeKey: `overdue-pile:${r._id.userId}:${weekKey}`,
    });
  }
}

async function remindGoalDeadlines(now) {
  const soon = new Date(now.getTime() + GOAL_WINDOW_MS);

  const approaching = await Goal.find({
    status: 'active',
    targetDate: { $gt: now, $lte: soon },
  })
    .select('title tenantId createdBy targetDate')
    .lean();

  for (const goal of approaching) {
    await notificationService.createNotification({
      tenantId: goal.tenantId,
      userId: goal.createdBy,
      type: 'reminder',
      module: 'goal',
      title: 'Goal deadline approaching',
      message: `"${goal.title}" is due ${fmtDate(goal.targetDate)}.`,
      relatedId: goal._id,
      priority: 'normal',
      dedupeKey: `goal-deadline:${goal._id}`,
    });
  }

  const reached = await Goal.find({
    status: 'active',
    targetDate: { $lt: now },
  })
    .select('title tenantId createdBy targetDate')
    .lean();

  for (const goal of reached) {
    await notificationService.createNotification({
      tenantId: goal.tenantId,
      userId: goal.createdBy,
      type: 'reminder',
      module: 'goal',
      title: 'Goal deadline reached',
      message: `"${goal.title}" deadline was ${fmtDate(goal.targetDate)}. Mark it complete when done.`,
      relatedId: goal._id,
      priority: 'normal',
      dedupeKey: `goal-deadline-reached:${goal._id}`,
    });
  }
}

/** Daily habit reminder, fired once each morning (08:00–08:59 server-local). */
async function remindHabits(now) {
  const hour = now.getHours();
  if (hour < 8 || hour >= 9) return;

  const today = fmtDate(now);
  const loggedHabitIds = await HabitLog.distinct('habitId', { date: today });
  const pending = await Habit.find({
    isArchived: { $ne: true },
    _id: { $nin: loggedHabitIds },
  })
    .select('name tenantId userId')
    .lean();

  for (const habit of pending) {
    await notificationService.createNotification({
      tenantId: habit.tenantId,
      userId: habit.userId,
      type: 'reminder',
      module: 'habit',
      title: 'Habit due today',
      message: `Don't forget "${habit.name}" today.`,
      relatedId: habit._id,
      priority: 'low',
      dedupeKey: `habit-daily:${habit._id}:${today}`,
    });
  }
}

/** Nightly cleanup of read notifications older than 90 days. */
async function cleanupOldNotifications(now) {
  const today = fmtDate(now);
  if (lastCleanupDate === today) return;
  lastCleanupDate = today;
  const res = await notificationService.cleanupExpired();
  if (res.deletedCount > 0) {
    console.log(`[scheduler] cleaned ${res.deletedCount} old read notifications`);
  }
}

const MEETING_HORIZON_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Configurable meeting reminders (1 day / 1 hour / 30 min / 15 min / custom minutes before).
 * Each (meeting, reminder, person) fires once thanks to the dedupeKey. If the server was asleep
 * (free hosting) a reminder still fires late, as long as the meeting has not started yet.
 */
export async function remindMeetings(now) {
  const meetings = await Meeting.find({ status: 'scheduled', startAt: { $gt: now, $lte: new Date(now.getTime() + MEETING_HORIZON_MS) } })
    .select('title tenantId organizerId startAt timezone reminders participants invite.version')
    .limit(500)
    .lean();

  for (const m of meetings) {
    const due = (m.reminders || []).filter((r) => now.getTime() >= m.startAt.getTime() - r * 60000);
    if (!due.length) continue;
    const mins = Math.max(1, Math.round((m.startAt.getTime() - now.getTime()) / 60000));
    // Only the tightest due reminder is sent now; wider ones that were already missed are skipped.
    const r = Math.min(...due);
    await notifyMeeting(m, 'reminder', { label: humanizeMinutes(mins), dedupeKey: (userId) => `meeting-remind:${m._id}:${r}:${userId}` });
  }
}

/**
 * "Your meeting is starting now" when a scheduled meeting's start time arrives (and for up to 10 minutes
 * after, in case the free-tier server was asleep). Skipped once the organizer has actually started it —
 * that sends its own "Your meeting has started" notification.
 */
export async function announceMeetingStarts(now) {
  const meetings = await Meeting.find({ status: 'scheduled', startAt: { $lte: now, $gt: new Date(now.getTime() - 10 * 60000) } })
    .select('title tenantId organizerId startAt timezone participants invite.version')
    .limit(200)
    .lean();
  for (const m of meetings) {
    await notifyMeeting(m, 'starting', { dedupeKey: (userId) => `meeting-starting:${m._id}:${userId}` });
  }
}

async function tick() {
  if (mongoose.connection.readyState !== 1) return; // not connected — skip
  try {
    const now = new Date();
    await Promise.allSettled([
      remindTaskDeadlines(now),
      remindCalendarEvents(now),
      remindMeetings(now),
      announceMeetingStarts(now),
      remindGoalDeadlines(now),
      remindIdleGoals(now),
      sendDueDigests(now),
      remindStreaksAtRisk(now),
      remindOverduePileUp(now),
      remindHabits(now),
      cleanupOldNotifications(now),
    ]);
  } catch (err) {
    console.error('[scheduler] tick failed:', err.message);
  }
}

export function startScheduler() {
  if (running) return;
  running = true;
  tick();
  timer = setInterval(tick, TICK_MS);
  timer.unref?.(); // never keep the process alive just for reminders
  console.log('[scheduler] started (every 60s)');
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
  running = false;
}
