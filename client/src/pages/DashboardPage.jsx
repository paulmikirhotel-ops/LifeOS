import React from 'react';
import {
  CheckCircle2, Clock, Calendar, TrendingUp,
  Plus, Zap, Wallet, ArrowRight, BookOpen, Bell, Check
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useTenant } from '../context/TenantContext.jsx';
import {
  StatCard, Card, Badge, Button, ErrorState, Skeleton, SkeletonCard, ProgressBar, AnimatedNumber
} from '../components/ui.jsx';
import { greeting, formatDate, formatCurrency } from '../utils/format.js';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import api from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import NextStepCard from '../components/nextstep/NextStepCard.jsx';

const EMPTY = {
  tasks: { dueToday: 0, completedToday: 0, pending: 0, items: [] },
  focus: { todayMinutes: 0 },
  finance: { incomeToday: 0, expenseToday: 0 },
  productivity: { score: 0, breakdown: [] },
  schedule: [],
  habits: { total: 0, completed: 0 },
  reminders: [],
};

const clock = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const PRIORITY_VARIANT = { high: 'error', medium: 'warning' };

function DashboardSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8" role="status" aria-busy="true">
      <span className="sr-only">Loading your dashboard…</span>
      <div className="space-y-2"><Skeleton className="h-8 w-64 max-w-full" /><Skeleton className="h-4 w-40" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[0, 1, 2, 3].map((i) => <StatCard key={i} loading />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8"><SkeletonCard lines={5} /><SkeletonCard lines={5} /></div>
        <SkeletonCard lines={4} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { can } = useTenant();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { data: dashboard, loading, error, reload } = useApi('/analytics/dashboard');

  if (loading && !dashboard) return <DashboardSkeleton />;
  if (error && !dashboard) {
    return (
      <Card><ErrorState title="Your dashboard couldn't load" description="Check your connection and try again. Your data is safe." details={error} onRetry={reload} /></Card>
    );
  }

  // Merge over safe defaults so a missing section never crashes the page.
  const d = dashboard || {};
  const stats = {
    tasks: { ...EMPTY.tasks, ...(d.tasks || {}) },
    focus: { ...EMPTY.focus, ...(d.focus || {}) },
    finance: { ...EMPTY.finance, ...(d.finance || {}) },
    productivity: { ...EMPTY.productivity, ...(d.productivity || {}) },
    habits: { ...EMPTY.habits, ...(d.habits || {}) },
    schedule: Array.isArray(d.schedule) ? d.schedule : [],
    reminders: Array.isArray(d.reminders) ? d.reminders : [],
  };
  const score = Math.min(100, Math.max(0, Number(stats.productivity.score) || 0));
  const items = Array.isArray(stats.tasks.items) ? stats.tasks.items : [];
  const habitPct = stats.habits.total > 0 ? Math.round((stats.habits.completed / stats.habits.total) * 100) : 0;
  const firstName = (user?.name || '').split(' ')[0];

  const toggleTask = async (taskId, currentStatus) => {
    try {
      const newStatus = currentStatus === 'completed' ? 'not_started' : 'completed';
      const res = await api.patch(`/tasks/${taskId}`, { status: newStatus });
      if (res.success) {
        addToast('Task updated');
        reload();
      }
    } catch (e) {
      addToast('Failed to update task', 'error');
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{formatDate(new Date(), 'EEEE, MMMM do')}</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
            {greeting()}{firstName ? `, ${firstName}` : ''}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Button icon={Plus} onClick={() => navigate('/tasks')}>Add Task</Button>
          <Button variant="secondary" icon={Zap} onClick={() => navigate('/focus')}>Focus</Button>
        </div>
      </header>

      <NextStepCard />

      {/* Stats */}
      <section aria-label="Today at a glance" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Tasks Due Today" value={Number(stats.tasks.dueToday) || 0} animate icon={CheckCircle2} color="indigo" />
        <StatCard title="Focus Time" value={`${Number(stats.focus.todayMinutes) || 0}m`} icon={Clock} color="amber" />
        <StatCard title="Habits" value={`${stats.habits.completed}/${stats.habits.total}`} icon={Zap} color="rose" />
        {can('finance.view') && (
          <StatCard title="Today's Balance" value={formatCurrency(stats.finance.incomeToday - stats.finance.expenseToday)} icon={Wallet} color="emerald" />
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        <div className="lg:col-span-2 space-y-6 sm:space-y-8 min-w-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
            <Card className="p-5 sm:p-6">
              <h2 className="font-bold mb-4 text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-500" aria-hidden="true" /> Productivity Score
              </h2>
              <div className="h-48 flex items-center justify-center relative" role="img" aria-label={`Productivity score ${score} out of 100`}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[{ name: 'Completed', value: score }, { name: 'Remaining', value: 100 - score }]}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={score > 0 && score < 100 ? 5 : 0}
                      dataKey="value"
                      startAngle={90}
                      endAngle={450}
                      stroke="none"
                    >
                      <Cell fill="var(--brand-indigo)" />
                      <Cell fill="var(--color-slate-100)" className="dark:fill-slate-800" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <AnimatedNumber value={score} className="text-3xl font-black text-slate-900 dark:text-white" />
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Points</span>
                </div>
              </div>
              {stats.habits.total > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-500 mb-1.5"><span>Habits today</span><span className="tabular-nums">{habitPct}%</span></div>
                  <ProgressBar value={habitPct} color="rose" label="Habits completed today" />
                </div>
              )}
            </Card>

            <Card className="p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4 gap-2">
                <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" aria-hidden="true" /> <span className="truncate">Tasks Due Today</span>
                </h2>
                <Link to="/tasks" className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex-shrink-0 py-2">View all</Link>
              </div>
              {items.length > 0 ? (
                <ul className="space-y-1">
                  {items.slice(0, 5).map((task) => {
                    const done = task.status === 'completed';
                    return (
                      <li key={task._id} className="flex items-center gap-3 rounded-xl -mx-2 px-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <button
                          onClick={() => toggleTask(task._id, task.status)}
                          role="checkbox"
                          aria-checked={done}
                          aria-label={`${done ? 'Mark not done' : 'Mark done'}: ${task.title}`}
                          className="relative flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
                        >
                          <span className={`w-5 h-5 rounded-md border-2 transition-all duration-200 flex items-center justify-center ${done ? 'bg-emerald-500 border-emerald-500 scale-100' : 'border-slate-300 dark:border-slate-600 group-hover:border-emerald-400'}`}>
                            {done && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                          </span>
                        </button>
                        <span className={`text-sm flex-1 truncate text-slate-700 dark:text-slate-300 transition-opacity ${done ? 'line-through opacity-50' : ''}`}>{task.title}</span>
                        {task.priority && (
                          <Badge variant={PRIORITY_VARIANT[task.priority] || 'info'} className="text-[10px] capitalize">{task.priority}</Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="py-6 text-center">
                  <div className="mx-auto mb-3 w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 flex items-center justify-center"><CheckCircle2 className="w-5 h-5" /></div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Nothing due today</p>
                  <p className="text-xs text-slate-500 mt-0.5">Enjoy the breathing room.</p>
                </div>
              )}
            </Card>
          </div>

          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-500" aria-hidden="true" /> Today's Schedule
              </h2>
              <Link to="/calendar" className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline py-2">Open calendar</Link>
            </div>
            {stats.schedule.length > 0 ? (
              <ol className="space-y-3">
                {stats.schedule.map((block, idx) => (
                  <li key={idx} className="flex gap-3 sm:gap-4">
                    <span className="w-12 flex-shrink-0 pt-3 text-right text-[11px] font-bold text-slate-400 tabular-nums">{clock(block.startMin || 0)}</span>
                    <div className="flex-1 min-w-0 flex gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                      <span className="w-1 rounded-full bg-indigo-500 flex-shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{block.title}</p>
                        <p className="text-xs text-slate-500">{block.category ? `${block.category} · ` : ''}{Math.max(0, (block.endMin || 0) - (block.startMin || 0))} mins</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-500 py-2">No blocks scheduled for today.</p>
            )}
          </Card>
        </div>

        <div className="space-y-6 sm:space-y-8 min-w-0">
          <Card className="p-5 sm:p-6 bg-gradient-to-br from-indigo-600 via-indigo-600 to-fuchsia-600 text-white border-none shadow-lg shadow-indigo-500/20">
            <h2 className="font-bold mb-1 flex items-center gap-2"><Zap className="w-4 h-4" aria-hidden="true" /> Quick Actions</h2>
            <p className="text-indigo-100 text-xs mb-5">Stay ahead of your day with these shortcuts.</p>
            <div className="grid grid-cols-1 gap-3">
              <button onClick={() => navigate('/focus')} className="flex items-center justify-between gap-3 p-3 min-h-14 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
                <span><span className="block text-sm font-bold">Start Pomodoro</span><span className="block text-[11px] text-indigo-100">25:00 focus session</span></span>
                <ArrowRight className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              </button>
              <button onClick={() => navigate('/journal')} className="flex items-center justify-between gap-3 p-3 min-h-14 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
                <span><span className="block text-sm font-bold">Write Journal</span><span className="block text-[11px] text-indigo-100">Capture your thoughts</span></span>
                <BookOpen className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              </button>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="font-bold mb-4 text-slate-900 dark:text-white flex items-center gap-2"><Bell className="w-4 h-4 text-amber-500" aria-hidden="true" /> Reminders</h2>
            {stats.reminders.length > 0 ? (
              <ul className="space-y-3">
                {stats.reminders.map((r, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" aria-hidden="true" />
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{r.message}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">All clear. No urgent reminders.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
