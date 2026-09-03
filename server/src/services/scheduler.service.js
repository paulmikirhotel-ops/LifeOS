import mongoose from 'mongoose';
import {
  Task,
  CalendarEvent,
  Goal,
  Habit,
  HabitLog,
} from '../models/index.js';
import * as notificationService from './notification.service.js';

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
  const events = await CalendarEvent.find({ startAt: { $gt: now, $lte: soon } })
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

async function tick() {
  if (mongoose.connection.readyState !== 1) return; // not connected — skip
  try {
    const now = new Date();
    await Promise.allSettled([
      remindTaskDeadlines(now),
      remindCalendarEvents(now),
      remindGoalDeadlines(now),
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
