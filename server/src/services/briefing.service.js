import {
  Task,
  Meeting,
  CalendarEvent,
  ScheduleBlock,
  FocusSession,
  Habit,
  HabitLog,
  Goal,
  Expense,
  Income,
  DailyNote,
  WeeklyReport,
  AiInsight,
  User,
} from '../models/index.js';
import * as goalService from './goal.service.js';
import { ApiError } from '../utils/ApiError.js';
import { toObjectId } from '../utils/objectId.js';
import { hasPermission } from '../config/permissions.js';
import { dateStr, localDayRange } from './dateHelpers.js';
import { focusMinutesOf, productivityScore } from './scoring.service.js';
import { aiConfigured, generateText } from './ai.service.js';
import {
  pickTopPriorities,
  weekRange,
  weekRangeFromString,
  previousWeek,
  buildWeeklyInsights,
  tomorrowFor,
  greetingFor,
  ymd,
} from './briefingLogic.js';

const OPEN = ['not_started', 'in_progress'];
const round2 = (n) => Math.round(n * 100) / 100;
const minToClock = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/* ───────────────────────────── AI sentence (opt-in, cached) ───────────────────────────── */

// The AI service retries patiently on rate limits; the Today page must not wait for that.
const AI_TIMEOUT_MS = 8000;
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('AI request timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const AI_SYSTEM =
  'You write one or two short, practical sentences for a personal planner app. ' +
  'Use only the facts in the data you are given; never invent numbers, names or events. ' +
  'Be warm and direct. No greetings, no emojis, no medical, legal, tax or investment advice.';

/**
 * Returns { enabled, available, text }.
 *  - available: the server has an AI provider configured
 *  - enabled:   the user switched AI insights on (opt-in; off by default)
 * Only counts and up to three task titles are ever sent. Journal text, receipts and
 * transcripts are never included. Each sentence is generated once and cached.
 */
async function aiSentence(user, kind, key, facts, instruction) {
  const available = aiConfigured();
  const row = await User.findById(user.id).select('aiInsights').lean();
  const enabled = Boolean(row?.aiInsights);
  const result = { enabled, available, text: null };
  if (!available || !enabled) return result;

  try {
    const cached = await AiInsight.findOne({ userId: user.id, kind, key }).lean();
    if (cached) return { ...result, text: cached.text };

    const text = (
      await withTimeout(
        generateText({
          system: AI_SYSTEM,
          prompt: `${instruction}\n\nData:\n${JSON.stringify(facts)}`,
          maxTokens: 160,
          temperature: 0.4,
        }),
        AI_TIMEOUT_MS
      )
    )
      ?.toString()
      .trim();
    if (!text) return result;

    await AiInsight.updateOne(
      { userId: user.id, kind, key },
      { $setOnInsert: { tenantId: user.tenantId, userId: user.id, kind, key, text: text.slice(0, 1000) } },
      { upsert: true }
    );
    return { ...result, text: text.slice(0, 1000) };
  } catch (err) {
    // A slow or failing AI provider must never break the briefing.
    console.warn(`[briefing] AI sentence skipped: ${err.message}`);
    return result;
  }
}

export async function getPreferences(user) {
  const row = await User.findById(user.id).select('aiInsights weeklyDigest isEmailVerified').lean();
  return {
    aiInsights: Boolean(row?.aiInsights),
    available: aiConfigured(),
    weeklyDigest: Boolean(row?.weeklyDigest),
    emailVerified: row?.isEmailVerified !== false,
  };
}

export async function setPreferences(user, { aiInsights, weeklyDigest }) {
  const set = {};
  if (aiInsights !== undefined) set.aiInsights = Boolean(aiInsights);
  if (weeklyDigest !== undefined) {
    set.weeklyDigest = Boolean(weeklyDigest);
    // Turning it on mid-week: the first email is next Monday's, not last week's report.
    if (weeklyDigest) set.weeklyDigestSentFor = previousWeek(weekRange(new Date())).startStr;
  }
  if (Object.keys(set).length) await User.updateOne({ _id: user.id }, { $set: set });
  return getPreferences(user);
}

/* ──────────────────────────────────── Morning ──────────────────────────────────── */

export async function getMorning(user, tenant) {
  const { id: userId, tenantId, permissions } = user;
  const now = new Date();
  const today = localDayRange();
  const todayStr = dateStr(now);
  const can = (p) => hasPermission(permissions, p);

  const out = {
    greeting: greetingFor(now.getHours()),
    date: todayStr,
    currency: tenant?.settings?.currency || 'USD',
    tasks: null,
    meetings: [],
    events: [],
    blocks: [],
    habits: null,
    goalsAtRisk: [],
    goalsIdle: [],
    money: null,
    ai: { enabled: false, available: aiConfigured(), text: null },
  };

  const jobs = [];

  if (can('tasks.view')) {
    jobs.push(
      Task.find({
        tenantId,
        status: { $in: OPEN },
        $or: [{ dueDate: { $lt: today.end } }, { priority: { $in: ['urgent', 'high'] } }],
      })
        .sort({ dueDate: 1 })
        .limit(300)
        .lean()
        .then((open) => {
          const overdue = open.filter((t) => t.dueDate && new Date(t.dueDate) < today.start).length;
          const dueToday = open.filter((t) => t.dueDate && new Date(t.dueDate) >= today.start && new Date(t.dueDate) < today.end).length;
          out.tasks = { overdue, dueToday, priorities: pickTopPriorities(open, now, 3) };
        })
    );
  }

  if (can('meetings.view')) {
    jobs.push(
      Meeting.find({
        tenantId,
        status: { $in: ['scheduled', 'live'] },
        startAt: { $gte: today.start, $lt: today.end },
        $or: [{ organizerId: userId }, { 'participants.userId': userId }],
      })
        .select('title startAt endAt status location')
        .sort({ startAt: 1 })
        .limit(10)
        .lean()
        .then((rows) => {
          out.meetings = rows;
        })
    );
  }

  if (can('schedule.view')) {
    jobs.push(
      CalendarEvent.find({ tenantId, userId, startAt: { $gte: today.start, $lt: today.end }, meetingId: null })
        .select('title type startAt endAt allDay')
        .sort({ startAt: 1 })
        .limit(10)
        .lean()
        .then((rows) => {
          out.events = rows;
        })
    );
    jobs.push(
      ScheduleBlock.find({ tenantId, userId, date: todayStr })
        .select('title startMin endMin category')
        .sort({ startMin: 1 })
        .limit(8)
        .lean()
        .then((rows) => {
          out.blocks = rows.map((b) => ({ ...b, start: minToClock(b.startMin), end: minToClock(b.endMin % 1440) }));
        })
    );
  }

  if (can('habits.view')) {
    jobs.push(
      Promise.all([
        Habit.find({ tenantId, userId, isArchived: false }).select('name color targetPerDay').lean(),
        HabitLog.find({ tenantId, userId, date: todayStr }).select('habitId').lean(),
      ]).then(([habits, logs]) => {
        const done = new Set(logs.map((l) => String(l.habitId)));
        out.habits = {
          total: habits.length,
          done: habits.filter((h) => done.has(String(h._id))).length,
          todo: habits.filter((h) => !done.has(String(h._id))).slice(0, 6),
        };
      })
    );
  }

  if (can('goals.view')) {
    jobs.push(
      Goal.find({ tenantId, status: 'active', targetDate: { $ne: null } })
        .select('title targetDate progress')
        .lean()
        .then((goals) => {
          const in14 = new Date(today.start);
          in14.setDate(in14.getDate() + 14);
          out.goalsAtRisk = goals
            .filter((g) => new Date(g.targetDate) <= in14 && (g.progress || 0) < 80)
            .sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate))
            .slice(0, 3)
            .map((g) => ({
              _id: g._id,
              title: g.title,
              progress: g.progress || 0,
              daysLeft: Math.ceil((new Date(g.targetDate) - today.start) / 86400000),
            }));
        })
    );
  }

  if (can('goals.view')) {
    jobs.push(
      goalService
        .findIdleGoals({ tenantId }, now)
        .then((rows) => {
          out.goalsIdle = rows.slice(0, 3).map((r) => ({ _id: r.goal._id, title: r.goal.title, idleDays: r.idleDays }));
        })
        .catch(() => {})
    );
  }

  if (can('finance.view')) {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    jobs.push(
      Expense.aggregate([
        { $match: { tenantId: toObjectId(tenantId), date: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).then((rows) => {
        out.money = { monthSpend: round2(rows[0]?.total || 0) };
      })
    );
  }

  await Promise.all(jobs);

  out.ai = await aiSentence(
    user,
    'morning',
    todayStr,
    {
      overdueTasks: out.tasks?.overdue ?? 0,
      dueToday: out.tasks?.dueToday ?? 0,
      topTasks: (out.tasks?.priorities || []).map((t) => ({ title: t.title, priority: t.priority, urgency: t.urgency })),
      meetingsToday: out.meetings.length,
      eventsToday: out.events.length,
      habitsLeft: out.habits ? out.habits.total - out.habits.done : 0,
      goalsNearDeadline: out.goalsAtRisk.length,
    },
    'Write a short plan-of-attack for today (one or two sentences) based on this data.'
  );

  return out;
}

/* ──────────────────────────────────── Evening ──────────────────────────────────── */

export async function getEvening(user, tenant) {
  const { id: userId, tenantId, permissions } = user;
  const now = new Date();
  const today = localDayRange();
  const todayStr = dateStr(now);
  const can = (p) => hasPermission(permissions, p);

  const out = {
    date: todayStr,
    currency: tenant?.settings?.currency || 'USD',
    tasks: null,
    focus: { minutes: 0, sessions: 0 },
    habits: null,
    spend: null,
    meetingsToday: 0,
    review: { wentWell: '', improve: '', saved: false },
  };
  const jobs = [];

  if (can('tasks.view')) {
    jobs.push(
      Promise.all([
        Task.countDocuments({ tenantId, status: 'completed', completedAt: { $gte: today.start, $lt: today.end } }),
        Task.find({ tenantId, status: { $in: OPEN }, dueDate: { $lt: today.end } })
          .select('title priority dueDate')
          .sort({ dueDate: 1 })
          .limit(10)
          .lean(),
        Task.countDocuments({ tenantId, status: { $in: OPEN }, dueDate: { $lt: today.end } }),
      ]).then(([completed, open, openTotal]) => {
        out.tasks = { completed, open, openTotal };
      })
    );
  }

  jobs.push(
    FocusSession.find({ tenantId, userId, status: 'completed', endedAt: { $gte: today.start, $lt: today.end } })
      .select('startedAt endedAt pausedMs')
      .lean()
      .then((rows) => {
        out.focus = { minutes: rows.reduce((s, r) => s + focusMinutesOf(r), 0), sessions: rows.length };
      })
  );

  if (can('habits.view')) {
    jobs.push(
      Promise.all([
        Habit.countDocuments({ tenantId, userId, isArchived: false }),
        HabitLog.countDocuments({ tenantId, userId, date: todayStr }),
      ]).then(([total, done]) => {
        out.habits = { total, done: Math.min(done, total) };
      })
    );
  }

  if (can('finance.view')) {
    jobs.push(
      Expense.aggregate([
        { $match: { tenantId: toObjectId(tenantId), date: { $gte: today.start, $lt: today.end } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).then((rows) => {
        out.spend = round2(rows[0]?.total || 0);
      })
    );
  }

  if (can('meetings.view')) {
    jobs.push(
      Meeting.countDocuments({
        tenantId,
        status: 'completed',
        startAt: { $gte: today.start, $lt: today.end },
        $or: [{ organizerId: userId }, { 'participants.userId': userId }],
      }).then((n) => {
        out.meetingsToday = n;
      })
    );
  }

  jobs.push(
    DailyNote.findOne({ tenantId, authorId: userId, type: 'review', entryDate: { $gte: today.start, $lt: today.end } })
      .select('sections')
      .lean()
      .then((note) => {
        if (!note) return;
        const text = (key) => (note.sections || []).find((s) => s.key === key)?.text || '';
        out.review = { wentWell: text('went_well'), improve: text('improve'), saved: true };
      })
  );

  await Promise.all(jobs);
  return out;
}

/**
 * Saves tonight's two reflection answers as a private `review` note, and applies the
 * one-tap choices for unfinished tasks ("move to tomorrow" or "drop").
 */
export async function saveReview(user, { wentWell = '', improve = '', mood, taskActions = [] }) {
  const { id: userId, tenantId, permissions } = user;
  const can = (p) => hasPermission(permissions, p);
  const now = new Date();
  const today = localDayRange();

  const hasText = Boolean(wentWell.trim() || improve.trim());
  if (hasText && !can('journal.create')) throw ApiError.forbidden('You do not have permission to write journal notes');
  if (taskActions.length > 0 && !can('tasks.edit')) throw ApiError.forbidden('You do not have permission to edit tasks');

  if (hasText) {
    const sections = [
      { key: 'went_well', text: wentWell.trim() },
      { key: 'improve', text: improve.trim() },
    ];
    const content = `What went well: ${wentWell.trim() || '—'}\n\nWhat I will change tomorrow: ${improve.trim() || '—'}`;
    const existing = await DailyNote.findOne({
      tenantId,
      authorId: userId,
      type: 'review',
      entryDate: { $gte: today.start, $lt: today.end },
    });
    if (existing) {
      existing.sections = sections;
      existing.content = content;
      if (mood) existing.mood = mood;
      await existing.save();
    } else {
      await DailyNote.create({
        tenantId,
        authorId: userId,
        type: 'review',
        entryDate: now,
        title: `Evening review ${ymd(now)}`,
        content,
        sections,
        mood,
        isPrivate: true,
      });
    }
  }

  let moved = 0;
  let dropped = 0;
  for (const { taskId, action } of taskActions.slice(0, 20)) {
    const task = await Task.findOne({ _id: taskId, tenantId, status: { $in: OPEN } }).select('dueDate').lean();
    if (!task) continue;
    if (action === 'tomorrow') {
      await Task.updateOne({ _id: taskId, tenantId }, { $set: { dueDate: tomorrowFor(task, now) } });
      moved += 1;
    } else if (action === 'drop') {
      await Task.updateOne({ _id: taskId, tenantId }, { $set: { status: 'cancelled' } });
      dropped += 1;
    }
  }

  return { saved: true, moved, dropped };
}

/* ───────────────────────────────────── Weekly ───────────────────────────────────── */

async function weekStats(user, range, now = new Date()) {
  const { id: userId, tenantId, permissions } = user;
  const can = (p) => hasPermission(permissions, p);
  const complete = range.end <= now;
  const daysCounted = complete ? 7 : Math.min(7, Math.floor((now - range.start) / 86400000) + 1);

  const stats = {
    tasksCompleted: 0,
    tasksMissed: 0,
    focusMinutes: 0,
    focusSessions: 0,
    habitCheckins: 0,
    habitSlots: 0,
    activeHabits: 0,
    spend: null,
    income: null,
    meetingsHeld: 0,
    daysCounted,
  };
  const jobs = [];

  if (can('tasks.view')) {
    jobs.push(
      Promise.all([
        Task.countDocuments({ tenantId, status: 'completed', completedAt: { $gte: range.start, $lt: range.end } }),
        Task.countDocuments({
          tenantId,
          dueDate: { $gte: range.start, $lt: range.end },
          $or: [
            { status: { $in: OPEN }, dueDate: { $lt: now } },
            { status: { $in: ['postponed', 'cancelled'] } },
          ],
        }),
      ]).then(([done, missed]) => {
        stats.tasksCompleted = done;
        stats.tasksMissed = missed;
      })
    );
  }

  jobs.push(
    FocusSession.find({ tenantId, userId, status: 'completed', endedAt: { $gte: range.start, $lt: range.end } })
      .select('startedAt endedAt pausedMs')
      .lean()
      .then((rows) => {
        stats.focusMinutes = rows.reduce((s, r) => s + focusMinutesOf(r), 0);
        stats.focusSessions = rows.length;
      })
  );

  if (can('habits.view')) {
    jobs.push(
      Promise.all([
        Habit.countDocuments({ tenantId, userId, isArchived: false }),
        HabitLog.countDocuments({ tenantId, userId, date: { $gte: range.startStr, $lte: range.endStr } }),
      ]).then(([active, checkins]) => {
        stats.activeHabits = active;
        stats.habitCheckins = checkins;
        stats.habitSlots = active * daysCounted;
      })
    );
  }

  if (can('finance.view')) {
    const tid = toObjectId(tenantId);
    const sum = (Model) =>
      Model.aggregate([
        { $match: { tenantId: tid, date: { $gte: range.start, $lt: range.end } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).then((r) => round2(r[0]?.total || 0));
    jobs.push(
      Promise.all([sum(Expense), sum(Income)]).then(([spend, income]) => {
        stats.spend = spend;
        stats.income = income;
      })
    );
  }

  if (can('meetings.view')) {
    jobs.push(
      Meeting.countDocuments({
        tenantId,
        status: 'completed',
        startAt: { $gte: range.start, $lt: range.end },
        $or: [{ organizerId: userId }, { 'participants.userId': userId }],
      }).then((n) => {
        stats.meetingsHeld = n;
      })
    );
  }

  await Promise.all(jobs);

  const { score, hasData, breakdown } = productivityScore({
    completed: stats.tasksCompleted,
    missed: stats.tasksMissed,
    focusMinutes: stats.focusMinutes,
    habitCheckins: stats.habitCheckins,
    activeHabits: stats.activeHabits,
    days: daysCounted,
  });
  return { ...stats, score, hasData, breakdown };
}

const snapshotOf = (doc) => ({
  week: { start: doc.weekStart, end: doc.weekEnd },
  score: doc.score,
  stats: doc.stats,
  insights: doc.insights,
});

async function saveSnapshot(user, range, stats, insights) {
  try {
    await WeeklyReport.updateOne(
      { tenantId: user.tenantId, userId: user.id, weekStart: range.startStr },
      {
        $setOnInsert: {
          tenantId: user.tenantId,
          userId: user.id,
          weekStart: range.startStr,
          weekEnd: range.endStr,
          score: stats.score,
          stats,
          insights,
        },
      },
      { upsert: true }
    );
  } catch (err) {
    console.warn(`[briefing] weekly snapshot not saved: ${err.message}`);
  }
}

export async function getWeekly(user, weekParam) {
  const now = new Date();
  let range = weekParam ? weekRangeFromString(weekParam) : weekRange(now);
  if (!range) throw ApiError.badRequest('Week must be a date in YYYY-MM-DD format');
  if (range.start > now) range = weekRange(now);

  const isCurrent = range.start <= now && now < range.end;
  const prevRange = previousWeek(range);

  // A finished week is stored once and never recalculated, so history stays stable.
  if (!isCurrent) {
    const saved = await WeeklyReport.findOne({ tenantId: user.tenantId, userId: user.id, weekStart: range.startStr }).lean();
    if (saved) {
      const ai = await aiSentence(user, 'weekly', range.startStr, weeklyFacts(saved.stats), WEEKLY_INSTRUCTION);
      return { ...snapshotOf(saved), isCurrent: false, ai };
    }
  }

  const [stats, prev] = await Promise.all([weekStats(user, range, now), weekStats(user, prevRange, now)]);
  const insights = buildWeeklyInsights(stats, prev);

  if (!isCurrent) await saveSnapshot(user, range, stats, insights);

  // Make sure last week is in the history the first time the user opens the current week.
  if (isCurrent) {
    const have = await WeeklyReport.exists({ tenantId: user.tenantId, userId: user.id, weekStart: prevRange.startStr });
    if (!have && prev.hasData) await saveSnapshot(user, prevRange, prev, buildWeeklyInsights(prev, null));
  }

  const ai = await aiSentence(user, 'weekly', range.startStr + (isCurrent ? `@${ymd(now)}` : ''), weeklyFacts(stats), WEEKLY_INSTRUCTION);

  return {
    week: { start: range.startStr, end: range.endStr },
    isCurrent,
    score: stats.score,
    stats,
    previous: { score: prev.score, hasData: prev.hasData, stats: prev },
    insights,
    ai,
  };
}

const WEEKLY_INSTRUCTION = 'Write two short observations about this week and one small suggestion for next week.';

function weeklyFacts(s) {
  return {
    tasksCompleted: s.tasksCompleted,
    tasksMissed: s.tasksMissed,
    focusHours: round2((s.focusMinutes || 0) / 60),
    habitConsistencyPct: s.habitSlots > 0 ? Math.min(100, Math.round((s.habitCheckins / s.habitSlots) * 100)) : null,
    meetingsHeld: s.meetingsHeld,
    productivityScore: s.score,
  };
}

export async function weeklyHistory(user) {
  const rows = await WeeklyReport.find({ tenantId: user.tenantId, userId: user.id })
    .sort({ weekStart: -1 })
    .limit(12)
    .select('weekStart weekEnd score stats insights')
    .lean();
  return { items: rows.map(snapshotOf) };
}
