import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area
} from 'recharts';
import { useApi } from '../hooks/useApi.js';
import { useTenant } from '../context/TenantContext.jsx';
import { Card, Spinner, StatCard } from '../components/ui.jsx';
import {
  TrendingUp, CheckCircle2, Zap, Wallet,
  PieChart as PieChartIcon, Activity
} from 'lucide-react';
import { formatCurrency } from '../utils/format.js';

const COLORS = ['#6366f1', '#d946ef', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4'];

const TOOLTIP_STYLE = { borderRadius: '12px', border: 'none' };
const money = (v) => formatCurrency(Number(v) || 0);
const minutesLabel = (v) => `${Math.round(Number(v) || 0)} min`;
const hoursLabel = (v) => `${Math.round((Number(v) || 0) / 60)}h`;

function ChartEmpty({ message = 'No data in the last 30 days yet' }) {
  return (
    <div className="h-full flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">
      {message}
    </div>
  );
}

export default function AnalyticsPage() {
  const { can } = useTenant();
  const { data: analytics, loading } = useApi('/analytics/overview');

  if (loading) return <div className="h-full flex items-center justify-center"><Spinner size="lg" /></div>;

  // Server contract (GET /analytics/overview) — every key has a safe default.
  const d = analytics || {};
  const tasks = d.tasks || {};
  const timeAndFocus = d.timeAndFocus || {};
  const habits = d.habits || {};
  const finance = d.finance || {};
  const totals = finance.totals || {};

  const taskRate = Math.round((tasks.completionRate ?? 0) * 100);
  const focusTotal = (timeAndFocus.focusPerDay || []).reduce((s, x) => s + (x.focusMinutes || 0), 0);
  const habitRate = Math.round((habits.completionPct ?? 0) * 100);
  const savingsRate = can('finance.view')
    ? Math.round(((totals.income - totals.expense) / (totals.income || 1)) * 100)
    : 0;

  const focusHours = focusTotal >= 60 ? `${Math.round(focusTotal / 60)}h` : `${Math.round(focusTotal)}m`;

  // Chart series derived from the server payload.
  const taskHistory = (tasks.perDay || []).map((row) => ({ date: (row.date || '').slice(5), completed: row.completed || 0, missed: row.missed || 0 }));
  const focusHistory = (timeAndFocus.focusPerDay || []).map((row) => ({ date: (row.date || '').slice(5), minutes: row.focusMinutes || 0 }));
  const financeHistory = (finance.perDay || []).map((row) => ({ date: (row.date || '').slice(5), income: row.income || 0, expense: row.expense || 0 }));
  const timeCategories = (timeAndFocus.timeByActivity || []).map((row) => ({ name: row.name || 'Other', value: row.value || 0 }));
  const expenseCategories = (finance.topExpenseCategories || []).map((row) => ({ name: row.name || 'Uncategorized', value: row.value || 0 }));

  return (
    <div className="space-y-8 pb-10">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">Analytics</h1>
          <p className="text-sm text-slate-500 font-medium">Data-driven insights into your performance</p>
        </div>
      </header>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Task Completion" value={`${taskRate}%`} icon={CheckCircle2} color="indigo" />
        <StatCard title="Total Focus" value={focusHours} icon={Zap} color="amber" />
        <StatCard title="Habit Success" value={`${habitRate}%`} icon={Activity} color="rose" />
        {can('finance.view') && (
          <StatCard title="Savings Rate" value={`${savingsRate}%`} icon={Wallet} color="emerald" />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Task Completion Trend */}
        <Card className="p-6 min-w-0">
          <h3 className="font-bold mb-6 dark:text-white flex items-center gap-2 truncate">
            <CheckCircle2 className="w-4 h-4 text-indigo-500 flex-shrink-0" /> <span className="truncate">Task Completion History</span>
          </h3>
          <div className="h-64 min-w-0">
            {taskHistory.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={taskHistory}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-800" />
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="completed" name="Completed" fill="var(--brand-indigo)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="missed" name="Missed" fill="var(--color-slate-200)" className="dark:fill-slate-700" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <ChartEmpty />}
          </div>
        </Card>

        {/* Focus Minutes */}
        <Card className="p-6 min-w-0">
          <h3 className="font-bold mb-6 dark:text-white flex items-center gap-2 truncate">
            <Zap className="w-4 h-4 text-amber-500 flex-shrink-0" /> <span className="truncate">Deep Work Distribution</span>
          </h3>
          <div className="h-64 min-w-0">
            {focusHistory.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={focusHistory}>
                  <defs>
                    <linearGradient id="colorFocus" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={minutesLabel} />
                  <Area type="monotone" dataKey="minutes" name="Focus" stroke="#f59e0b" fillOpacity={1} fill="url(#colorFocus)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <ChartEmpty />}
          </div>
        </Card>

        {/* Time by Category */}
        <Card className="p-6 min-w-0">
          <h3 className="font-bold mb-6 dark:text-white flex items-center gap-2 truncate">
            <PieChartIcon className="w-4 h-4 text-fuchsia-500 flex-shrink-0" /> <span className="truncate">Time by Category</span>
          </h3>
          <div className="h-64 flex flex-col md:flex-row items-center gap-8 min-w-0">
            {timeCategories.length ? (
              <>
                <div className="flex-1 h-full w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={timeCategories} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" nameKey="name">
                        {timeCategories.map((_, i) => (
                          <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={hoursLabel} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 w-full md:w-48">
                  {timeCategories.slice(0, 5).map((cat, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-slate-500 font-medium truncate">{cat.name}</span>
                      </div>
                      <span className="font-bold dark:text-white ml-2">{Math.round((cat.value || 0) / 60)}h</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <ChartEmpty />}
          </div>
        </Card>

        {/* Finance Trend */}
        {can('finance.view') && (
          <Card className="p-6 min-w-0">
            <h3 className="font-bold mb-6 dark:text-white flex items-center gap-2 truncate">
              <TrendingUp className="w-4 h-4 text-emerald-500 flex-shrink-0" /> <span className="truncate">Financial Momentum</span>
            </h3>
            <div className="h-64 min-w-0">
              {financeHistory.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={financeHistory}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-800" />
                    <XAxis dataKey="date" hide />
                    <YAxis hide />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={money} />
                    <Line type="monotone" dataKey="income" name="Income" stroke="#10b981" strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="expense" name="Expenses" stroke="#f43f5e" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <ChartEmpty />}
            </div>
          </Card>
        )}
      </div>

      {/* Top spending categories (finance members) */}
      {can('finance.view') && expenseCategories.length > 0 && (
        <Card className="p-6">
          <h3 className="font-bold mb-4 dark:text-white flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-500" /> Top Spending Categories
          </h3>
          <div className="space-y-3">
            {expenseCategories.map((cat, i) => {
              const max = expenseCategories[0]?.value || 1;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-500 w-36 truncate text-left">{cat.name}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(4, ((cat.value || 0) / max) * 100)}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                  </div>
                  <span className="text-sm font-bold dark:text-white w-24 text-right">{formatCurrency(cat.value || 0)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
