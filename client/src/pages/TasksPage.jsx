import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Sparkles, LayoutList, Columns3, Inbox, ChevronDown, TriangleAlert, RotateCcw, Loader2, X } from 'lucide-react';
import api from '../api/client.js';
import { formatApiError } from '../utils/errors.js';
import { useToast } from '../context/ToastContext.jsx';
import { Spinner } from '../components/ui.jsx';
import ConfirmDialog from '../components/meetings/ConfirmDialog.jsx';
import TaskStats from '../components/tasks/TaskStats.jsx';
import TaskRow from '../components/tasks/TaskRow.jsx';
import TaskBoard from '../components/tasks/TaskBoard.jsx';
import TaskDrawer from '../components/tasks/TaskDrawer.jsx';
import { minutesToClock } from '../utils/format.js';
import { BUCKETS, bucketOf, offsetKey, PRIORITIES, sortTasks, taskStats, todayKey } from '../utils/taskHelpers.js';

const TABS = ['All', 'Today', 'Upcoming', 'Overdue', 'Completed'];
const PAGE = 50; // server maximum per request
const MAX_PAGES = 10;

const SMART_EXAMPLES = ['Study JavaScript for 2 hours tomorrow', 'Write project report for 90 min', 'Gym session for 1 hour'];

const store = {
  get: (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode: ignore */ } },
};

/** Parses "Study JavaScript for 2 hours tomorrow" into { title, durationMin, date }. */
function parseSmart(text) {
  const m = text.match(/for\s+(\d+)\s*(hours?|hrs?|h|minutes?|mins?|min)\b/i);
  let durationMin = 60;
  if (m) {
    const n = parseInt(m[1], 10);
    durationMin = m[2].toLowerCase().startsWith('h') ? n * 60 : n;
  }
  durationMin = Math.max(15, Math.min(480, durationMin));
  const title = text.replace(/for\s+\d+\s*(hours?|hrs?|h|minutes?|mins?|min)\b.*$/i, '').replace(/\b(today|tomorrow)\b/i, '').trim() || text;
  const date = /tomorrow/i.test(text) ? offsetKey(1) : todayKey();
  return { title, durationMin, date };
}

export default function TasksPage() {
  const { addToast } = useToast();
  const today = todayKey();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('All');
  const [view, setView] = useState(() => store.get('lifeos.tasks.view', 'list'));
  const [sort, setSort] = useState(() => store.get('lifeos.tasks.sort', 'due'));
  const [priority, setPriority] = useState('all');
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState({ open: false, task: null });
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [quick, setQuick] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  const [smart, setSmart] = useState('');
  const [planning, setPlanning] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);

  /** Loads every page (the API caps a page at 50) so the counts and the board are complete. */
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      let page = 1;
      let all = [];
      let total = Infinity;
      while (all.length < total && page <= MAX_PAGES) {
        const res = await api.get('/tasks', { params: { page, limit: PAGE } });
        const items = res.data?.items || [];
        all = all.concat(items);
        total = res.data?.total ?? all.length;
        if (!items.length) break;
        page += 1;
      }
      setTasks(all);
      setLoadError('');
    } catch (e) {
      console.error('[tasks] load failed:', e);
      setLoadError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const replaceLocal = (updated) => setTasks((list) => list.map((t) => (t._id === updated._id ? { ...t, ...updated } : t)));

  /** Optimistic update: the UI changes instantly, and is put back (from the server) if the request fails. */
  const patchTask = async (task, patch) => {
    replaceLocal({ _id: task._id, ...patch, ...(patch.status === 'completed' ? { completedAt: new Date().toISOString() } : {}) });
    try {
      const res = await api.patch(`/tasks/${task._id}`, patch);
      replaceLocal(res.data);
    } catch (e) {
      console.error('[tasks] update failed:', e);
      addToast(formatApiError(e), 'error');
      load({ silent: true });
    }
  };

  const toggle = (task) => patchTask(task, { status: task.status === 'completed' ? 'not_started' : 'completed' });
  const move = (task, status) => patchTask(task, { status });
  const toggleSubtask = (task, index) => {
    const subtasks = task.subtasks.map((s, i) => ({ title: s.title, isDone: i === index ? !s.isDone : s.isDone }));
    return patchTask(task, { subtasks });
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/tasks/${toDelete._id}`);
      setTasks((list) => list.filter((t) => t._id !== toDelete._id));
      addToast('Task deleted');
      setToDelete(null);
    } catch (e) {
      console.error('[tasks] delete failed:', e);
      addToast(formatApiError(e), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const quickAdd = async (e) => {
    e.preventDefault();
    const title = quick.trim();
    if (!title || quickBusy) return;
    setQuickBusy(true);
    try {
      const res = await api.post('/tasks', { title, priority: 'medium', category: 'General', ...(tab === 'Today' ? { dueDate: today } : {}) });
      setTasks((list) => [res.data, ...list]);
      setQuick('');
    } catch (ex) {
      console.error('[tasks] quick add failed:', ex);
      addToast(formatApiError(ex), 'error');
    } finally {
      setQuickBusy(false);
    }
  };

  const smartPlan = async (text = smart) => {
    const raw = text.trim();
    if (!raw || planning) return;
    setPlanning(true);
    try {
      const { title, durationMin, date } = parseSmart(raw);
      const res = await api.post('/tasks/plan', { title, durationMin, date });
      const { task, suggestion } = res.data || {};
      // The plan endpoint only creates the bare task; stamp it with the day and length that were asked for.
      if (task?._id) {
        try { await api.patch(`/tasks/${task._id}`, { dueDate: date, estimatedMinutes: durationMin }); } catch (pe) { console.error('[tasks] could not set plan details:', pe); }
      }
      addToast(suggestion
        ? `Planned for ${date === today ? 'today' : 'tomorrow'}, ${minutesToClock(suggestion.startMin)}–${minutesToClock(suggestion.endMin)}`
        : 'Task created. No free slot was found in your schedule that day.');
      setSmart('');
      load({ silent: true });
    } catch (e) {
      console.error('[tasks] smart plan failed:', e);
      addToast(`Could not plan that. ${formatApiError(e)}`, 'error');
    } finally {
      setPlanning(false);
    }
  };

  const stats = useMemo(() => taskStats(tasks, today), [tasks, today]);
  const categories = useMemo(() => [...new Set(tasks.map((t) => t.category).filter(Boolean))].sort(), [tasks]);

  const tabCounts = useMemo(() => {
    const c = { All: tasks.length, Today: 0, Upcoming: 0, Overdue: 0, Completed: 0 };
    for (const t of tasks) {
      const b = bucketOf(t, today);
      if (b === 'today') c.Today += 1;
      else if (b === 'overdue') c.Overdue += 1;
      else if (['tomorrow', 'week', 'later'].includes(b)) c.Upcoming += 1;
      else if (b === 'done' && t.status === 'completed') c.Completed += 1;
    }
    return c;
  }, [tasks, today]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = tasks.filter((t) => {
      if (priority !== 'all' && t.priority !== priority) return false;
      if (q && !`${t.title} ${t.description || ''} ${t.category || ''}`.toLowerCase().includes(q)) return false;
      const b = bucketOf(t, today);
      if (tab === 'Today') return b === 'today';
      if (tab === 'Overdue') return b === 'overdue';
      if (tab === 'Upcoming') return ['tomorrow', 'week', 'later'].includes(b);
      if (tab === 'Completed') return t.status === 'completed';
      return true;
    });
    return sortTasks(list, sort);
  }, [tasks, tab, search, priority, sort, today]);

  const groups = useMemo(() => {
    const by = {};
    for (const t of visible) (by[bucketOf(t, today)] ||= []).push(t);
    return BUCKETS.map((b) => ({ ...b, items: by[b.id] || [] })).filter((g) => g.items.length);
  }, [visible, today]);

  const filtering = Boolean(search.trim()) || priority !== 'all';
  const openDrawer = (task = null) => setDrawer({ open: true, task });
  const closeDrawer = useCallback(() => setDrawer((d) => ({ ...d, open: false })), []);

  const subtitle = loading ? 'Loading your tasks…'
    : stats.open === 0 ? 'You are all caught up.'
    : [stats.dueToday && `${stats.dueToday} due today`, stats.overdue && `${stats.overdue} overdue`, `${stats.open} open`].filter(Boolean).join(' · ');

  const selectCls = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Tasks</h1>
          <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400" aria-live="polite">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => openDrawer()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 active:scale-[0.98] dark:focus-visible:ring-offset-slate-950"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> New task
        </button>
      </header>

      <TaskStats stats={stats} onJump={setTab} />

      {/* Smart plan */}
      <section aria-label="Smart plan" className="relative overflow-hidden rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-4 shadow-sm dark:border-indigo-500/20 dark:from-indigo-500/10 dark:via-slate-900 dark:to-violet-500/10 sm:p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-indigo-300">
          <Sparkles className="h-4 w-4" aria-hidden="true" /> Smart plan
          <span className="font-medium text-slate-500 dark:text-slate-400">· describe it, we find the time</span>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); smartPlan(); }} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={smart}
            onChange={(e) => setSmart(e.target.value)}
            aria-label="Describe a task to plan"
            placeholder="Study JavaScript for 2 hours tomorrow"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <button type="submit" disabled={planning || !smart.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">
            {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Plan it
          </button>
        </form>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {SMART_EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => setSmart(ex)} className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-white hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700">
              {ex}
            </button>
          ))}
        </div>
      </section>

      {/* Toolbar */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div role="tablist" aria-label="Task filter" className="no-scrollbar flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 dark:bg-slate-800/70">
            {TABS.map((name) => (
              <button
                key={name}
                role="tab"
                aria-selected={tab === name}
                onClick={() => setTab(name)}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${tab === name ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
              >
                {name}
                <span className={`rounded-full px-1.5 text-[11px] font-bold tabular-nums ${name === 'Overdue' && tabCounts.Overdue ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300' : 'bg-slate-200/70 text-slate-500 dark:bg-slate-700 dark:text-slate-300'}`}>{tabCounts[name]}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[10rem] flex-1 lg:w-60 lg:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search tasks"
                placeholder="Search tasks…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button>}
            </div>
            <select aria-label="Filter by priority" value={priority} onChange={(e) => setPriority(e.target.value)} className={selectCls}>
              <option value="all">All priorities</option>
              {Object.entries(PRIORITIES).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
            </select>
            <select aria-label="Sort tasks" value={sort} onChange={(e) => { setSort(e.target.value); store.set('lifeos.tasks.sort', e.target.value); }} className={selectCls}>
              <option value="due">Sort: Due date</option>
              <option value="priority">Sort: Priority</option>
              <option value="newest">Sort: Newest</option>
            </select>
            <div role="group" aria-label="View" className="flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              {[['list', LayoutList, 'List view'], ['board', Columns3, 'Board view']].map(([id, Icon, label]) => (
                <button key={id} type="button" aria-label={label} title={label} aria-pressed={view === id} onClick={() => { setView(id); store.set('lifeos.tasks.view', id); }} className={`rounded-lg p-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${view === id ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-24"><Spinner size="lg" /></div>
      ) : loadError ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-6 py-12 text-center dark:border-rose-500/30 dark:bg-rose-500/10">
          <TriangleAlert className="h-8 w-8 text-rose-500" aria-hidden="true" />
          <p className="font-semibold text-rose-800 dark:text-rose-200">We couldn't load your tasks</p>
          <p className="max-w-sm text-sm text-rose-700 dark:text-rose-300">{loadError}</p>
          <button type="button" onClick={() => load()} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"><RotateCcw className="h-4 w-4" /> Try again</button>
        </div>
      ) : view === 'board' ? (
        <TaskBoard tasks={visible.filter((t) => t.status !== 'cancelled')} today={today} onOpen={openDrawer} onToggle={toggle} onMove={move} />
      ) : (
        <div className="space-y-6">
          <form onSubmit={quickAdd} className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-3 transition focus-within:border-indigo-400 focus-within:bg-white dark:border-slate-700 dark:bg-slate-900/60 dark:focus-within:bg-slate-900">
            {quickBusy ? <Loader2 className="h-5 w-5 animate-spin text-indigo-500" /> : <Plus className="h-5 w-5 text-slate-400" aria-hidden="true" />}
            <input
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              aria-label="Quick add a task"
              placeholder={tab === 'Today' ? 'Add a task for today and press Enter' : 'Add a task and press Enter'}
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white"
            />
          </form>

          {groups.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-slate-200/80 bg-white px-6 py-16 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10"><Inbox className="h-7 w-7" aria-hidden="true" /></span>
              <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">
                {filtering ? 'No tasks match your filters' : tasks.length === 0 ? 'No tasks yet' : tab === 'Overdue' ? 'Nothing overdue' : tab === 'Today' ? 'Nothing due today' : tab === 'Completed' ? 'No completed tasks yet' : 'Nothing here'}
              </h2>
              <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">
                {filtering ? 'Try a different search or clear the priority filter.' : tasks.length === 0 ? 'Add your first task above, or describe it in Smart plan.' : 'Nice work. Add a task whenever something comes up.'}
              </p>
              {filtering
                ? <button type="button" onClick={() => { setSearch(''); setPriority('all'); }} className="mt-5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Clear filters</button>
                : <button type="button" onClick={() => openDrawer()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><Plus className="h-4 w-4" /> New task</button>}
            </div>
          ) : groups.map((g) => {
            const collapsible = g.id === 'done' && tab === 'All';
            const expanded = !collapsible || doneOpen;
            return (
              <section key={g.id} aria-label={g.title}>
                <h2 className="mb-2.5 flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {collapsible ? (
                    <button type="button" onClick={() => setDoneOpen((v) => !v)} aria-expanded={doneOpen} className="flex items-center gap-1.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                      <ChevronDown className={`h-4 w-4 transition-transform ${doneOpen ? '' : '-rotate-90'}`} aria-hidden="true" />{g.title}
                    </button>
                  ) : (
                    <span className={g.id === 'overdue' ? 'text-rose-600 dark:text-rose-400' : ''}>{g.title}</span>
                  )}
                  <span className="rounded-full bg-slate-200/70 px-1.5 text-[11px] tabular-nums dark:bg-slate-800">{g.items.length}</span>
                </h2>
                {expanded && (
                  <ul className="space-y-2.5">
                    {g.items.map((t) => (
                      <TaskRow key={t._id} task={t} today={today} onToggle={toggle} onOpen={openDrawer} onDelete={setToDelete} onToggleSubtask={toggleSubtask} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <TaskDrawer
        open={drawer.open}
        task={drawer.task}
        defaultDue={tab === 'Today' ? today : ''}
        categories={categories}
        onClose={closeDrawer}
        onSaved={(saved, wasEdit) => {
          setTasks((list) => (wasEdit ? list.map((t) => (t._id === saved._id ? saved : t)) : [saved, ...list]));
          addToast(wasEdit ? 'Task updated' : 'Task created');
          closeDrawer();
        }}
      />

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete task?"
        message={toDelete ? `"${toDelete.title}" will be permanently removed. This can't be undone.` : ''}
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => !deleting && setToDelete(null)}
      />
    </div>
  );
}
