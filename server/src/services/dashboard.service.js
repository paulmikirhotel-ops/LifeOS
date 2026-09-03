import {
  Task,
  ScheduleBlock,
  FocusSession,
  Habit,
  HabitLog,
  Goal,
  Income,
  Expense,
  DailyNote,
} from '../models/index.js';
import { dateStr, localDayRange, addDays } from './dateHelpers.js';
import { hasPermission } from '../config/permissions.js';
import { toObjectId } from '../utils/objectId.js';

export async function get(user, tenant) {
  const { id: userId, tenantId, permissions } = user;
  const tenantOid = toObjectId(tenantId);
  const now = new Date();
  const todayRange = localDayRange();
  const todayStr = dateStr(now);

  // Greeting
  const hour = now.getHours();
  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';

  // 1. Tasks
  const [dueTodayCount, top5DueToday, completedTodayCount, pendingTotal, overdueTasks] = await Promise.all([
    Task.countDocuments({ tenantId, dueDate: { $gte: todayRange.start, $lt: todayRange.end }, status: { $nin: ['completed', 'cancelled'] } }),
    Task.find({ tenantId, dueDate: { $gte: todayRange.start, $lt: todayRange.end }, status: { $nin: ['completed', 'cancelled'] } }).sort({ dueDate: 1 }).limit(5).lean(),
    Task.countDocuments({ tenantId, completedAt: { $gte: todayRange.start, $lt: todayRange.end }, status: 'completed' }),
    Task.countDocuments({ tenantId, status: { $in: ['not_started', 'in_progress'] } }),
    Task.find({ tenantId, dueDate: { $lt: todayRange.start }, status: { $in: ['not_started', 'in_progress'] } }).sort({ dueDate: 1 }).lean(),
  ]);

  const overdueCount = overdueTasks.length;
  const top3Overdue = overdueTasks.slice(0, 3);

  // 2. Schedule
  let schedule = null;
  if (hasPermission(permissions, 'schedule.view')) {
    schedule = await ScheduleBlock.find({ tenantId, date: todayStr }).sort({ startMin: 1 }).lean();
  }

  // 3. Focus
  const [completedFocusToday, activeFocusSession] = await Promise.all([
    FocusSession.find({ tenantId, userId, status: 'completed', endedAt: { $gte: todayRange.start, $lt: todayRange.end } }).lean(),
    FocusSession.findOne({ tenantId, userId, status: 'active' }).lean(),
  ]);
  const focusMinutes = completedFocusToday.reduce((sum, s) => sum + (s.duration || 0), 0);
  const activeFocus = !!activeFocusSession;

  // 4. Habits
  const [activeHabitsCount, habitLogsTodayCount] = await Promise.all([
    Habit.countDocuments({ tenantId, userId, status: 'active' }),
    HabitLog.countDocuments({ tenantId, userId, date: todayStr }),
  ]);

  // 5. Goals
  const activeGoals = await Goal.find({ tenantId, status: 'active' }).lean();
  const goalsCount = activeGoals.length;
  const goalsAvgProgress = goalsCount > 0 ? activeGoals.reduce((sum, g) => sum + (g.progress || 0), 0) / goalsCount : 0;

  // 6. Journal
  const [journalToday, myDayToday] = await Promise.all([
    DailyNote.findOne({ tenantId, userId, date: todayStr, type: 'journal' }).lean(),
    DailyNote.findOne({ tenantId, userId, date: todayStr, type: 'myDay' }).lean(),
  ]);

  // 7. Finance
  let finance = null;
  if (hasPermission(permissions, 'finance.view')) {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const [todayInc, todayExp, monthInc, monthExp, allInc, allExp] = await Promise.all([
      Income.aggregate([{ $match: { tenantId: tenantOid, date: { $gte: todayRange.start, $lt: todayRange.end } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Expense.aggregate([{ $match: { tenantId: tenantOid, date: { $gte: todayRange.start, $lt: todayRange.end } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Income.aggregate([{ $match: { tenantId: tenantOid, date: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Expense.aggregate([{ $match: { tenantId: tenantOid, date: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Income.aggregate([{ $match: { tenantId: tenantOid } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Expense.aggregate([{ $match: { tenantId: tenantOid } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    ]);

    const getSum = (arr) => (arr.length > 0 ? arr[0].total : 0);
    const openingBalance = tenant.settings?.openingBalance || 0;
    const balance = openingBalance + getSum(allInc) - getSum(allExp);

    finance = {
      todayIncome: getSum(todayInc),
      todayExpense: getSum(todayExp),
      monthIncome: getSum(monthInc),
      monthExpense: getSum(monthExp),
      balance: Math.round(balance * 100) / 100,
    };
  }

  // 8. Productivity Score (Last 7 days including today)
  const windowStart = addDays(todayRange.start, -6);
  const [windowCompleted, windowMissedTasks, windowFocus, windowHabitLogs] = await Promise.all([
    Task.countDocuments({ tenantId, completedAt: { $gte: windowStart, $lt: todayRange.end }, status: 'completed' }),
    Task.find({ 
      tenantId, 
      dueDate: { $gte: windowStart, $lt: todayRange.end }, 
      $or: [
        { status: { $in: ['not_started', 'in_progress'] }, dueDate: { $lt: now } },
        { status: { $in: ['postponed', 'cancelled'] } }
      ]
    }).countDocuments(),
    FocusSession.find({ tenantId, userId, status: 'completed', endedAt: { $gte: windowStart, $lt: todayRange.end } }).lean(),
    HabitLog.countDocuments({ tenantId, userId, date: { $gte: dateStr(windowStart), $lte: todayStr } }),
  ]);

  const rateDenom = windowCompleted + windowMissedTasks;
  const rate = rateDenom > 0 ? windowCompleted / rateDenom : 0;
  
  const focusSeconds = windowFocus.reduce((sum, s) => sum + (s.duration || 0) * 60, 0);
  const focusRatio = Math.min(focusSeconds / (7 * 60 * 60), 1);
  
  const habitRatio = windowHabitLogs / (Math.max(activeHabitsCount, 1) * 7);
  const cappedHabitRatio = Math.min(habitRatio, 1);

  const productivityScore = Math.round(100 * (0.5 * rate + 0.3 * focusRatio + 0.2 * cappedHabitRatio));
  const productivityBreakdown = { taskRate: rate, focusRatio, habitRatio: cappedHabitRatio };

  // 9. Reminders
  const dueSoonTasks = await Task.find({ 
    tenantId, 
    dueDate: { $gt: now, $lte: addDays(now, 3) }, 
    status: { $ne: 'completed' } 
  }).sort({ dueDate: 1 }).limit(3).lean();

  const dueSoonGoals = activeGoals
    .filter(g => g.targetDate && g.targetDate > now && g.targetDate <= addDays(now, 3))
    .slice(0, 2);

  const reminders = [
    ...top3Overdue.map(t => ({ type: 'task', id: t._id, title: t.title, when: t.dueDate })),
    ...dueSoonTasks.map(t => ({ type: 'task', id: t._id, title: t.title, when: t.dueDate })),
    ...dueSoonGoals.map(g => ({ type: 'goal', id: g._id, title: g.title, when: g.targetDate })),
  ];

  return {
    greeting,
    tasks: {
      dueToday: dueTodayCount,
      topDueToday: top5DueToday,
      completedToday: completedTodayCount,
      pendingTotal,
      overdue: overdueCount,
      topOverdue: top3Overdue,
    },
    schedule,
    focus: {
      focusMinutes,
      activeFocus,
    },
    habits: {
      activeCount: activeHabitsCount,
      logsToday: habitLogsTodayCount,
    },
    goals: {
      activeCount: goalsCount,
      avgProgress: Math.round(goalsAvgProgress * 100) / 100,
    },
    journal: {
      hasJournalToday: !!journalToday,
      hasMyDayToday: !!myDayToday,
    },
    finance,
    productivityScore,
    productivityBreakdown,
    reminders,
  };
}
