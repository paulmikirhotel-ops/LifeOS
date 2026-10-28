import React, { useState } from 'react';
import { CheckCircle2, Circle, Plus, Link2, Repeat, ListTodo, CalendarClock, AlertTriangle } from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import api from '../api/client.js';
import { formatApiError } from '../utils/errors.js';
import { useToast } from '../context/ToastContext.jsx';
import { Button, Badge, Modal, Input, Select, ErrorState, Skeleton, ProgressBar } from './ui.jsx';
import { formatDate } from '../utils/format.js';

const HEALTH = {
  on_track: { text: 'On track', variant: 'success' },
  slipping: { text: 'Slipping', variant: 'warning' },
  overdue: { text: 'Past target date', variant: 'error' },
  no_plan: { text: 'No plan yet', variant: 'neutral' },
  done: { text: 'Done', variant: 'brand' },
  cancelled: { text: 'Cancelled', variant: 'neutral' },
};

const rowBtn =
  'w-full min-h-11 flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 px-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60';

/**
 * The plan behind one goal: milestones, linked tasks and habits, with quick-add.
 * Progress is calculated by the server from milestones + linked tasks.
 */
export default function GoalDetail({ goalId, onClose, onChanged }) {
  const { addToast } = useToast();
  const { data, loading, error, reload } = useApi(`/goals/${goalId}/overview`);
  const [milestone, setMilestone] = useState('');
  const [task, setTask] = useState({ title: '', dueDate: '' });
  const [habit, setHabit] = useState('');
  const [candidates, setCandidates] = useState(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    reload();
    onChanged?.();
  };

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) addToast(okMsg);
      refresh();
      return true;
    } catch (e) {
      addToast(formatApiError(e), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const goal = data?.goal;
  const milestones = Array.isArray(goal?.milestones) ? goal.milestones : [];
  const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
  const habits = Array.isArray(data?.habits) ? data.habits : [];
  const summary = data?.summary;
  const health = HEALTH[summary?.health];

  const saveMilestones = (next) => api.patch(`/goals/${goalId}`, {
    milestones: next.map((m) => ({ title: m.title, isDone: !!m.isDone, dueDate: m.dueDate ? String(m.dueDate).split('T')[0] : undefined })),
  });

  const addMilestone = async (e) => {
    e.preventDefault();
    const title = milestone.trim();
    if (!title) return;
    if (await run(() => saveMilestones([...milestones, { title, isDone: false }]))) setMilestone('');
  };

  const toggleMilestone = (idx) =>
    run(() => saveMilestones(milestones.map((m, i) => (i === idx ? { ...m, isDone: !m.isDone } : m))));

  const addTask = async (e) => {
    e.preventDefault();
    const title = task.title.trim();
    if (!title) return;
    const body = { title, goalId };
    if (task.dueDate) body.dueDate = task.dueDate;
    if (await run(() => api.post('/tasks', body), 'Task added to goal')) setTask({ title: '', dueDate: '' });
  };

  const toggleTask = (t) =>
    run(() => api.patch(`/tasks/${t._id}`, { status: t.status === 'completed' ? 'not_started' : 'completed' }));

  const addHabit = async (e) => {
    e.preventDefault();
    const name = habit.trim();
    if (!name) return;
    if (await run(() => api.post('/habits', { name, goalId }), 'Habit added to goal')) setHabit('');
  };

  const loadCandidates = async () => {
    try {
      const res = await api.get('/tasks?limit=50');
      const list = Array.isArray(res?.data?.items) ? res.data.items : [];
      setCandidates(list.filter((t) => !t.goalId && !['completed', 'cancelled'].includes(t.status)));
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  const linkExisting = async () => {
    if (!pick) return;
    if (await run(() => api.patch(`/tasks/${pick}`, { goalId }), 'Task linked')) {
      setPick('');
      setCandidates(null);
    }
  };

  const unlink = (t) => run(() => api.patch(`/tasks/${t._id}`, { goalId: null }), 'Task unlinked');

  return (
    <Modal isOpen onClose={onClose} title={goal?.title || 'Goal plan'} className="max-w-2xl">
      {loading && !data ? (
        <div className="space-y-3"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-24 w-full" /></div>
      ) : error && !data ? (
        <ErrorState title="Plan couldn't load" details={error} onRetry={reload} />
      ) : (
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {health && <Badge variant={health.variant}>{health.text}</Badge>}
              <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{goal.progress}%</span>
            </div>
            <ProgressBar value={goal.progress} label="Goal progress" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {summary.autoProgress
                ? `Calculated from ${summary.done} of ${summary.total} milestones and tasks finished.`
                : 'Add milestones or tasks and progress is calculated for you.'}
              {summary.idleDays !== null && summary.idleDays >= 7 && summary.health !== 'done' ? ` No activity for ${summary.idleDays} days.` : ''}
            </p>
            {goal.targetDate && (
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" /> Target {formatDate(goal.targetDate, 'MMM d, yyyy')}
              </p>
            )}
          </div>

          <section aria-labelledby="gd-ms" className="space-y-2">
            <h3 id="gd-ms" className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <ListTodo className="w-3.5 h-3.5" aria-hidden="true" /> Milestones
            </h3>
            <ul>
              {milestones.map((m, idx) => (
                <li key={m._id || idx}>
                  <button disabled={busy} onClick={() => toggleMilestone(idx)} role="checkbox" aria-checked={!!m.isDone} className={rowBtn}>
                    {m.isDone ? <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" aria-hidden="true" /> : <Circle className="w-5 h-5 shrink-0 text-slate-300" aria-hidden="true" />}
                    <span className={`text-sm break-words min-w-0 ${m.isDone ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>{m.title}</span>
                  </button>
                </li>
              ))}
            </ul>
            <form onSubmit={addMilestone} className="flex gap-2 items-end">
              <Input label="Add milestone" placeholder="A checkpoint on the way" value={milestone} onChange={(e) => setMilestone(e.target.value)} className="flex-1 min-w-0" />
              <Button type="submit" icon={Plus} disabled={busy || !milestone.trim()} aria-label="Add milestone">Add</Button>
            </form>
          </section>

          <section aria-labelledby="gd-tasks" className="space-y-2">
            <h3 id="gd-tasks" className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Tasks</h3>
            {tasks.length === 0 && <p className="text-sm text-slate-500">No tasks linked yet.</p>}
            <ul>
              {tasks.map((t) => (
                <li key={t._id} className="flex items-center gap-1">
                  <button disabled={busy} onClick={() => toggleTask(t)} role="checkbox" aria-checked={t.status === 'completed'} className={rowBtn}>
                    {t.status === 'completed' ? <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" aria-hidden="true" /> : <Circle className="w-5 h-5 shrink-0 text-slate-300" aria-hidden="true" />}
                    <span className={`text-sm break-words min-w-0 ${t.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
                      {t.title}
                      {t.dueDate && t.status !== 'completed' && new Date(t.dueDate) < new Date() && (
                        <AlertTriangle className="inline w-3.5 h-3.5 ml-1.5 text-amber-500" aria-label="Overdue" />
                      )}
                    </span>
                  </button>
                  <button disabled={busy} onClick={() => unlink(t)} className="min-h-11 px-2 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0" aria-label={`Unlink ${t.title}`}>Unlink</button>
                </li>
              ))}
            </ul>
            <form onSubmit={addTask} className="grid grid-cols-1 sm:grid-cols-[1fr_9rem_auto] gap-2 items-end">
              <Input label="Add task" placeholder="A concrete next step" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} />
              <Input label="Due" type="date" value={task.dueDate} onChange={(e) => setTask({ ...task, dueDate: e.target.value })} />
              <Button type="submit" icon={Plus} disabled={busy || !task.title.trim()}>Add</Button>
            </form>
            {candidates === null ? (
              <button onClick={loadCandidates} className="min-h-11 text-sm font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                <Link2 className="w-4 h-4" aria-hidden="true" /> Link an existing task
              </button>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-slate-500">No open, unlinked tasks to attach.</p>
            ) : (
              <div className="flex gap-2 items-end">
                <Select
                  label="Existing task"
                  className="flex-1 min-w-0"
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                  options={[{ value: '', label: 'Choose a task…' }, ...candidates.map((t) => ({ value: t._id, label: t.title }))]}
                />
                <Button onClick={linkExisting} disabled={busy || !pick}>Link</Button>
              </div>
            )}
          </section>

          <section aria-labelledby="gd-habits" className="space-y-2">
            <h3 id="gd-habits" className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Repeat className="w-3.5 h-3.5" aria-hidden="true" /> Habits
            </h3>
            {habits.length === 0 && <p className="text-sm text-slate-500">Repeating routines belong here, such as “write 30 minutes a day”.</p>}
            <ul className="space-y-2">
              {habits.map((h) => (
                <li key={h._id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700 dark:text-slate-300 break-words min-w-0">{h.name}</span>
                    <span className="text-xs text-slate-500 tabular-nums shrink-0 ml-3">{h.consistency}% last 14 days</span>
                  </div>
                  <ProgressBar value={h.consistency} label={`${h.name} consistency`} />
                </li>
              ))}
            </ul>
            <form onSubmit={addHabit} className="flex gap-2 items-end">
              <Input label="Add habit" placeholder="Something you will repeat" value={habit} onChange={(e) => setHabit(e.target.value)} className="flex-1 min-w-0" />
              <Button type="submit" icon={Plus} disabled={busy || !habit.trim()}>Add</Button>
            </form>
          </section>

          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
