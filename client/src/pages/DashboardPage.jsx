import React from 'react';
import { 
  CheckCircle2, Clock, Calendar, TrendingUp, 
  Plus, Zap, Wallet, ArrowRight 
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useTenant } from '../context/TenantContext.jsx';
import { 
  StatCard, Card, Spinner, Badge, Button 
} from '../components/ui.jsx';
import { greeting, formatDate, formatCurrency } from '../utils/format.js';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, 
  BarChart, Bar, XAxis, YAxis, Tooltip 
} from 'recharts';
import api from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';

export default function DashboardPage() {
  const { user } = useAuth();
  const { can } = useTenant();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { data: dashboard, loading, reload } = useApi('/analytics/dashboard');

  if (loading) return <div className="h-full flex items-center justify-center"><Spinner size="lg" /></div>;

  const stats = dashboard || {
    tasks: { dueToday: 0, completedToday: 0, pending: 0 },
    focus: { todayMinutes: 0 },
    finance: { incomeToday: 0, expenseToday: 0 },
    productivity: { score: 0, breakdown: [] },
    schedule: [],
    habits: { total: 0, completed: 0 }
  };

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
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">
            {greeting()}, {user?.name.split(' ')[0]}
          </h1>
          <p className="text-slate-500 text-sm font-medium">{formatDate(new Date(), 'EEEE, MMMM do')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" icon={Plus} onClick={() => navigate('/tasks')}>Add Task</Button>
          <Button size="sm" variant="secondary" icon={Zap} onClick={() => navigate('/focus')}>Focus</Button>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard 
          title="Tasks Due Today" 
          value={stats.tasks.dueToday} 
          icon={CheckCircle2} 
          color="indigo" 
        />
        <StatCard 
          title="Focus Time" 
          value={`${stats.focus.todayMinutes}m`} 
          icon={Clock} 
          color="amber" 
        />
        <StatCard 
          title="Habits" 
          value={`${stats.habits.completed}/${stats.habits.total}`} 
          icon={Zap} 
          color="rose" 
        />
        {can('finance.view') && (
          <StatCard 
            title="Today's Balance" 
            value={formatCurrency(stats.finance.incomeToday - stats.finance.expenseToday)} 
            icon={Wallet} 
            color="emerald" 
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Productivity & Tasks */}
        <div className="lg:col-span-2 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card className="p-6">
              <h3 className="font-bold mb-4 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-500" /> Productivity Score
              </h3>
              <div className="h-48 flex items-center justify-center relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Completed', value: stats.productivity.score },
                        { name: 'Remaining', value: 100 - stats.productivity.score }
                      ]}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      startAngle={90}
                      endAngle={450}
                    >
                      <Cell fill="var(--brand-indigo)" />
                      <Cell fill="var(--color-slate-100)" className="dark:fill-slate-800" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-black dark:text-white">{stats.productivity.score}</span>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Points</span>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold dark:text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Tasks Due Today
                </h3>
                <Link to="/tasks" className="text-xs text-indigo-600 font-bold hover:underline">View All</Link>
              </div>
              <div className="space-y-3">
                {stats.tasks.items?.length > 0 ? (
                  stats.tasks.items.slice(0, 5).map(task => (
                    <div key={task._id} className="flex items-center gap-3 group">
                      <button 
                        onClick={() => toggleTask(task._id, task.status)}
                        className={`w-5 h-5 rounded-md border-2 transition-colors flex items-center justify-center ${task.status === 'completed' ? 'bg-emerald-500 border-emerald-500' : 'border-slate-200 dark:border-slate-700 hover:border-emerald-400'}`}
                      >
                        {task.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </button>
                      <span className={`text-sm flex-1 truncate dark:text-slate-300 ${task.status === 'completed' ? 'line-through opacity-50' : ''}`}>
                        {task.title}
                      </span>
                      <Badge variant={task.priority === 'high' ? 'error' : task.priority === 'medium' ? 'warning' : 'info'} className="text-[10px]">
                        {task.priority}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 py-4 text-center">No tasks due today. Relax! ☕</p>
                )}
              </div>
            </Card>
          </div>

          <Card className="p-6">
            <h3 className="font-bold mb-6 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-500" /> Today's Schedule
            </h3>
            <div className="relative pl-12 space-y-4 border-l-2 border-slate-100 dark:border-slate-800 ml-4">
              {stats.schedule.length > 0 ? (
                stats.schedule.map((block, idx) => (
                  <div key={idx} className="relative">
                    <div className="absolute -left-[58px] top-0 text-[10px] font-bold text-slate-400 w-10 text-right">
                      {Math.floor(block.startMin / 60).toString().padStart(2, '0')}:{(block.startMin % 60).toString().padStart(2, '0')}
                    </div>
                    <div className="absolute -left-[18px] top-1.5 w-3 h-3 rounded-full bg-white dark:bg-slate-900 border-2 border-indigo-500 z-10" />
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700">
                      <p className="text-sm font-bold dark:text-white">{block.title}</p>
                      <p className="text-[10px] text-slate-500">{block.category} • {block.endMin - block.startMin} mins</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500 py-2">No blocks scheduled for today.</p>
              )}
            </div>
          </Card>
        </div>

        {/* Right Column: Reminders & Actions */}
        <div className="space-y-8">
          <Card className="p-6 bg-gradient-to-br from-indigo-600 to-indigo-700 text-white border-none shadow-indigo-500/20 shadow-lg">
            <h3 className="font-bold mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4" /> Quick Actions
            </h3>
            <p className="text-indigo-100 text-xs mb-6">Stay ahead of your day with these shortcuts.</p>
            <div className="grid grid-cols-1 gap-3">
              <button 
                onClick={() => navigate('/focus')}
                className="flex items-center justify-between p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-bold">Start Pomodoro</p>
                  <p className="text-[10px] text-indigo-200">25:00 focus session</p>
                </div>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button 
                onClick={() => navigate('/journal')}
                className="flex items-center justify-between p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-bold">Write Journal</p>
                  <p className="text-[10px] text-indigo-200">Capture your thoughts</p>
                </div>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-bold mb-4 dark:text-white">Reminders</h3>
            <div className="space-y-4">
              {dashboard?.reminders?.length > 0 ? (
                dashboard.reminders.map((r, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="mt-1">
                      <Badge variant="warning" className="w-2 h-2 p-0 rounded-full" />
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {r.message}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">All clear! No urgent reminders.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
