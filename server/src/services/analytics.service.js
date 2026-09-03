import {
  Task,
  ScheduleBlock,
  FocusSession,
  TimeEntry,
  Habit,
  HabitLog,
  Goal,
  Income,
  Expense,
  FinancialCategory,
} from '../models/index.js';
import { dateStr, localDayRange, rangeDays, addDays } from './dateHelpers.js';
import { hasPermission } from '../config/permissions.js';
import { toObjectId } from '../utils/objectId.js';

export async function overview(user, permissions, { from, to }) {
  const { id: userId, tenantId } = user;
  const toStr = to || dateStr();
  const fromStr = from || dateStr(addDays(new Date(toStr + 'T00:00:00'), -29));
  
  const days = rangeDays(fromStr, toStr);
  const startRange = new Date(fromStr + 'T00:00:00');
  const endRange = localDayRange(toStr).end;

  const results = {};

  // 1. Tasks
  if (hasPermission(permissions, 'tasks.view')) {
    const tasks = await Task.find({
      tenantId,
      $or: [
        { completedAt: { $gte: startRange, $lt: endRange } },
        { dueDate: { $gte: startRange, $lt: endRange } },
      ],
    }).lean();

    const perDayMap = {};
    days.forEach(d => { perDayMap[d] = { date: d, completed: 0, missed: 0 }; });

    let completedCount = 0;
    let missedCount = 0;
    const byStatus = {};
    const byPriority = {};

    tasks.forEach(t => {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;

      if (t.status === 'completed' && t.completedAt >= startRange && t.completedAt < endRange) {
        completedCount++;
        const dStr = dateStr(t.completedAt);
        if (perDayMap[dStr]) perDayMap[dStr].completed++;
      }
      
      const isMissed = (['not_started', 'in_progress'].includes(t.status) && t.dueDate < new Date()) || 
                       (['postponed', 'cancelled'].includes(t.status));
      
      if (isMissed && t.dueDate >= startRange && t.dueDate < endRange) {
        missedCount++;
        const dStr = dateStr(t.dueDate);
        if (perDayMap[dStr]) perDayMap[dStr].missed++;
      }
    });

    const totalRate = completedCount + missedCount;
    results.tasks = {
      completed: completedCount,
      missed: missedCount,
      completionRate: totalRate > 0 ? Math.round((completedCount / totalRate) * 100) / 100 : 0,
      byStatus: Object.entries(byStatus).map(([name, value]) => ({ name, value })),
      byPriority: Object.entries(byPriority).map(([name, value]) => ({ name, value })),
      perDay: Object.values(perDayMap),
    };
  }

  // 2. Time & Focus
  const focusSessions = await FocusSession.find({
    tenantId,
    userId,
    status: 'completed',
    endedAt: { $gte: startRange, $lt: endRange },
  }).lean();

  const focusPerDayMap = {};
  days.forEach(d => { focusPerDayMap[d] = { date: d, focusMinutes: 0 }; });
  focusSessions.forEach(s => {
    const dStr = dateStr(s.endedAt);
    if (focusPerDayMap[dStr]) {
      // FocusSession has no stored duration — derive it from the timestamps.
      const minutes = Math.max(0, Math.round((s.endedAt - s.startedAt - (s.pausedMs || 0)) / 60000));
      focusPerDayMap[dStr].focusMinutes += minutes;
    }
  });

  const timeEntries = await TimeEntry.find({
    tenantId,
    userId,
    endedAt: { $exists: true, $ne: null, $gte: startRange, $lt: endRange },
  }).lean();

  const activityMap = {};
  timeEntries.forEach(e => {
    const duration = Math.round((new Date(e.endedAt) - new Date(e.startedAt)) / 60000);
    activityMap[e.activityType] = (activityMap[e.activityType] || 0) + duration;
  });

  results.timeAndFocus = {
    focusPerDay: Object.values(focusPerDayMap),
    timeByActivity: Object.entries(activityMap).map(([name, value]) => ({ name, value })),
  };

  // 3. Habits
  // Habit has no `status` field — archived state is isArchived (mirrors dashboard()).
  const activeHabits = await Habit.find({ tenantId, userId, isArchived: { $ne: true } }).lean();
  const habitLogs = await HabitLog.find({
    tenantId,
    userId,
    date: { $gte: fromStr, $lte: toStr },
  }).lean();

  const habitCompletionPct = activeHabits.length > 0 
    ? (habitLogs.length / (activeHabits.length * days.length)) 
    : 0;

  results.habits = {
    completionPct: Math.round(Math.min(habitCompletionPct, 1) * 100) / 100,
  };

  // 4. Finance
  if (hasPermission(permissions, 'finance.view')) {
    const [incomes, expenses, categories] = await Promise.all([
      Income.find({ tenantId, date: { $gte: startRange, $lt: endRange } }).lean(),
      Expense.find({ tenantId, date: { $gte: startRange, $lt: endRange } }).lean(),
      FinancialCategory.find({ tenantId }).lean(),
    ]);

    const financePerDayMap = {};
    days.forEach(d => { financePerDayMap[d] = { date: d, income: 0, expense: 0 }; });

    let totalIncome = 0;
    incomes.forEach(i => {
      totalIncome += i.amount;
      const dStr = dateStr(i.date);
      if (financePerDayMap[dStr]) financePerDayMap[dStr].income += i.amount;
    });

    let totalExpense = 0;
    const categoryMap = {};
    expenses.forEach(e => {
      totalExpense += e.amount;
      const dStr = dateStr(e.date);
      if (financePerDayMap[dStr]) financePerDayMap[dStr].expense += e.amount;
      
      const catId = e.categoryId?.toString();
      categoryMap[catId] = (categoryMap[catId] || 0) + e.amount;
    });

    const topExpenseCategories = Object.entries(categoryMap)
      .map(([id, value]) => {
        const cat = categories.find(c => c._id.toString() === id);
        return { name: cat ? cat.name : 'Uncategorized', value };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    results.finance = {
      perDay: Object.values(financePerDayMap),
      totals: {
        income: Math.round(totalIncome * 100) / 100,
        expense: Math.round(totalExpense * 100) / 100,
      },
      topExpenseCategories,
    };
  }

  // 5. Goals
  const goals = await Goal.find({ tenantId }).lean();
  results.goals = {
    active: goals.filter(g => g.status === 'active').length,
    completed: goals.filter(g => g.status === 'completed').length,
  };

  return results;
}

/**
 * Home dashboard payload — exactly the shape DashboardPage.jsx renders.
 * Sections are permission-aware (finance only for finance.view members).
 */
export async function dashboard(user, permissions) {
  const { id: userId, tenantId } = user;
  const tenantOid = toObjectId(tenantId);
  const today = dateStr();
  const day = localDayRange(today);
  const out = {
    tasks: { dueToday: 0, completedToday: 0, pending: 0, items: [] },
    focus: { todayMinutes: 0 },
    finance: { incomeToday: 0, expenseToday: 0 },
    productivity: { score: 0 },
    schedule: [],
    habits: { total: 0, completed: 0 },
    reminders: [],
  };

  const round2 = (n) => Math.round(n * 100) / 100;

  // ── Tasks ────────────────────────────────────────────────
  if (hasPermission(permissions, 'tasks.view')) {
    const [dueTasks, completedToday, pending] = await Promise.all([
      Task.find({
        tenantId,
        $and: [
          { status: { $nin: ['completed', 'cancelled'] } },
          { $or: [{ dueDate: { $gte: day.start, $lt: day.end } }, { dueDate: { $lt: day.start } }] },
        ],
      })
        .sort({ dueDate: 1, createdAt: -1 })
        .limit(6)
        .lean(),
      Task.countDocuments({ tenantId, status: 'completed', completedAt: { $gte: day.start, $lt: day.end } }),
      Task.countDocuments({ tenantId, status: { $nin: ['completed', 'cancelled'] } }),
    ]);

    const dueToday = dueTasks.filter(t => t.dueDate && t.dueDate >= day.start).length;
    out.tasks = {
      dueToday,
      completedToday,
      pending,
      items: dueTasks.map(t => ({
        _id: t._id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
      })),
    };

    // Reminders: overdue first, then due within 24h
    const soon = new Date(Date.now() + 24 * 3600000);
    const overdue = dueTasks.filter(t => t.dueDate && t.dueDate < day.start);
    overdue.forEach(t => out.reminders.push({ type: 'overdue', message: `Overdue: ${t.title}` }));
    const upcoming = await Task.find({
      tenantId,
      status: { $nin: ['completed', 'cancelled'] },
      dueDate: { $gte: day.start, $lte: soon },
    })
      .sort({ dueDate: 1 })
      .limit(3)
      .lean();
    upcoming
      .filter(t => !overdue.some(o => o._id.equals(t._id)))
      .forEach(t => out.reminders.push({ type: 'due', message: `Due ${dateStr(t.dueDate)}: ${t.title}` }));
    out.reminders = out.reminders.slice(0, 5);
  }

  // ── Schedule (today's time blocks) ───────────────────────
  if (hasPermission(permissions, 'schedule.view')) {
    const blocks = await ScheduleBlock.find({ tenantId, date: today }).sort({ startMin: 1 }).lean();
    out.schedule = blocks.map(b => ({
      _id: b._id,
      title: b.title,
      category: b.category,
      startMin: b.startMin,
      endMin: b.endMin,
    }));
  }

  // ── Focus (completed sessions today) ─────────────────────
  // NOTE: was `$match: { completed: true }` + `$sum: '$actualSeconds'` — neither
  // field exists on FocusSession (it uses status:'completed', startedAt/endedAt/pausedMs),
  // so this always returned 0. Compute seconds from the timestamps instead.
  const focusSessions = await FocusSession.find({
    tenantId,
    userId,
    status: 'completed',
    endedAt: { $gte: day.start, $lt: day.end },
  }).lean();
  const focusSeconds = focusSessions.reduce(
    (sum, s) => sum + Math.max(0, (s.endedAt - s.startedAt - (s.pausedMs || 0)) / 1000),
    0
  );
  out.focus.todayMinutes = Math.round(focusSeconds / 60);

  // ── Habits (mine, today) ─────────────────────────────────
  const habits = await Habit.find({ tenantId, userId, isArchived: { $ne: true } }).lean();
  out.habits.total = habits.length;
  if (habits.length > 0) {
    const habitIds = habits.map(h => h._id);
    const logged = await HabitLog.distinct('habitId', { tenantId, userId, habitId: { $in: habitIds }, date: today });
    out.habits.completed = logged.length;
  }

  // ── Finance (today's movements) ──────────────────────────
  if (hasPermission(permissions, 'finance.view')) {
    const [incomes, expenses] = await Promise.all([
      Income.aggregate([
        { $match: { tenantId: tenantOid, date: { $gte: day.start, $lt: day.end } } },
        { $group: { _id: null, sum: { $sum: '$amount' } } },
      ]),
      Expense.aggregate([
        { $match: { tenantId: tenantOid, date: { $gte: day.start, $lt: day.end } } },
        { $group: { _id: null, sum: { $sum: '$amount' } } },
      ]),
    ]);
    out.finance = {
      incomeToday: round2(incomes[0]?.sum || 0),
      expenseToday: round2(expenses[0]?.sum || 0),
    };
  }

  // ── Productivity score (0-100) ───────────────────────────
  const weekStart = new Date(addDays(new Date(day.start), -6).setHours(0, 0, 0, 0));
  const [completedWeek, missedWeek] = await Promise.all([
    Task.countDocuments({ tenantId, status: 'completed', completedAt: { $gte: weekStart, $lt: day.end } }),
    Task.countDocuments({
      tenantId,
      status: { $in: ['not_started', 'in_progress'] },
      dueDate: { $gte: weekStart, $lt: day.start },
    }),
  ]);
  const taskTotal = completedWeek + missedWeek;
  const taskRatio = taskTotal > 0 ? completedWeek / taskTotal : 1;
  const habitRatio = out.habits.total > 0 ? out.habits.completed / out.habits.total : 0.5;
  out.productivity.score = Math.round(100 * (taskRatio * 0.7 + habitRatio * 0.3));

  return out;
}
