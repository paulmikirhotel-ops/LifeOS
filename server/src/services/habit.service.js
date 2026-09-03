import { ApiError } from '../utils/ApiError.js';
import { Habit, HabitLog } from '../models/index.js';
import { assertObjectId } from '../utils/objectId.js';
import * as notificationService from './notification.service.js';

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function calculateStreaks(logDates) {
  if (!logDates.length) return { currentStreak: 0, bestStreak: 0 };

  const today = getLocalDateString();
  const yesterday = getLocalDateString(new Date(Date.now() - 86400000));

  let currentStreak = 0;
  let bestStreak = 0;
  let tempStreak = 0;

  const sortedDates = [...new Set(logDates)].sort();

  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) {
      tempStreak = 1;
    } else {
      const prev = parseLocalDate(sortedDates[i - 1]);
      const curr = parseLocalDate(sortedDates[i]);
      const diff = Math.round((curr - prev) / (1000 * 60 * 60 * 24));

      if (diff === 1) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    }
    if (tempStreak > bestStreak) bestStreak = tempStreak;
  }

  // Current streak check
  const lastDate = sortedDates[sortedDates.length - 1];
  if (lastDate === today || lastDate === yesterday) {
    let checkDate = lastDate;
    let idx = sortedDates.length - 1;
    while (idx >= 0 && sortedDates[idx] === checkDate) {
      currentStreak++;
      idx--;
      checkDate = getLocalDateString(new Date(parseLocalDate(checkDate).getTime() - 86400000));
    }
  }

  return { currentStreak, bestStreak };
}

export async function list(user) {
  const habits = await Habit.find({ tenantId: user.tenantId, userId: user.id, isArchived: false }).lean();

  const enriched = await Promise.all(
    habits.map(async (h) => {
      const logs = await HabitLog.find({
        tenantId: user.tenantId,
        userId: user.id,
        habitId: h._id,
      })
        .sort({ date: 1 })
        .lean();

      const logDates = logs.map((l) => l.date);
      const { currentStreak, bestStreak } = calculateStreaks(logDates);

      const now = new Date();
      const weekAgo = getLocalDateString(new Date(now.getTime() - 7 * 86400000));
      const monthAgo = getLocalDateString(new Date(now.getTime() - 30 * 86400000));

      const completedThisWeek = logDates.filter((d) => d >= weekAgo).length;
      const completedThisMonth = logDates.filter((d) => d >= monthAgo).length;

      return {
        ...h,
        logs,
        streak: currentStreak,
        bestStreak,
        stats: { currentStreak, bestStreak, completedThisWeek, completedThisMonth },
      };
    })
  );

  return { items: enriched, total: enriched.length };
}

export async function create(user, body) {
  return Habit.create({
    ...body,
    tenantId: user.tenantId,
    userId: user.id,
  });
}

export async function update(user, id, patch) {
  assertObjectId(id);
  const habit = await Habit.findOneAndUpdate(
    { _id: id, tenantId: user.tenantId, userId: user.id },
    { $set: patch },
    { new: true }
  );
  if (!habit) throw ApiError.notFound();
  return habit;
}

export async function remove(user, id) {
  assertObjectId(id);
  const habit = await Habit.findOneAndDelete({ _id: id, tenantId: user.tenantId, userId: user.id });
  if (!habit) throw ApiError.notFound();
  await HabitLog.deleteMany({ habitId: id, tenantId: user.tenantId, userId: user.id });
}

export async function log(user, habitId, { date, count = 1 }) {
  assertObjectId(habitId);
  const logDate = date || getLocalDateString();

  const habit = await Habit.findOne({ _id: habitId, tenantId: user.tenantId, userId: user.id });
  if (!habit) throw ApiError.notFound();

  const existing = await HabitLog.findOne({
    tenantId: user.tenantId,
    userId: user.id,
    habitId,
    date: logDate,
  }).lean();

  const entry = await HabitLog.findOneAndUpdate(
    { tenantId: user.tenantId, userId: user.id, habitId, date: logDate },
    { $inc: { count } },
    { new: true, upsert: true }
  );

  // Notify only when the habit is logged for the FIRST time that day.
  if (!existing) {
    notificationService.notify({
      tenantId: habit.tenantId,
      userId: habit.userId,
      type: 'habit',
      module: 'habit',
      title: 'Habit completed',
      message: `Nice — "${habit.name}" done for today.`,
      relatedId: habit._id,
      priority: 'low',
    });
  }

  return entry;
}

export async function unlog(user, habitId, { date }) {
  assertObjectId(habitId);
  if (!date) throw ApiError.badRequest('Date is required');
  await HabitLog.deleteOne({ tenantId: user.tenantId, userId: user.id, habitId, date });
}

export async function stats(user, { from, to }) {
  const habits = await Habit.find({ tenantId: user.tenantId, userId: user.id, isArchived: false }).lean();

  const startDate = from || getLocalDateString(new Date(Date.now() - 30 * 86400000));
  const endDate = to || getLocalDateString();

  const totalDays = Math.round((parseLocalDate(endDate) - parseLocalDate(startDate)) / 86400000) + 1;

  const result = await Promise.all(
    habits.map(async (h) => {
      const completedDays = await HabitLog.countDocuments({
        tenantId: user.tenantId,
        userId: user.id,
        habitId: h._id,
        date: { $gte: startDate, $lte: endDate },
      });

      return {
        id: h._id,
        name: h.name,
        completedDays,
        totalDays,
        pct: totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0,
      };
    })
  );

  return { habits: result };
}
