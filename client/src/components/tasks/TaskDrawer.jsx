import React, { useEffect, useRef, useState } from 'react';
import { X, Plus, Trash2, Loader2 } from 'lucide-react';
import api from '../../api/client.js';
import { formatApiError } from '../../utils/errors.js';
import { Checkbox } from './TaskRow.jsx';
import { offsetKey, PRIORITIES, STATUSES, todayKey } from '../../utils/taskHelpers.js';

const EMPTY = { title: '', description: '', priority: 'medium', status: 'not_started', category: 'General', dueDate: '', estimatedMinutes: '', notes: '', subtasks: [] };

const fieldCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white';
const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${active ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800'}`}
    >
      {children}
    </button>
  );
}

/** Slide-over editor for creating and editing a task (bottom sheet on phones). */
export default function TaskDrawer({ open, task, defaultDue = '', categories = [], onClose, onSaved, onError }) {
  const [form, setForm] = useState(EMPTY);
  const [newSub, setNewSub] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const titleRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setErr('');
    setNewSub('');
    if (task) {
      setForm({
        title: task.title || '',
        description: task.description || '',
        priority: task.priority || 'medium',
        status: task.status || 'not_started',
        category: task.category || '',
        dueDate: task.dueDate ? String(task.dueDate).slice(0, 10) : '',
        estimatedMinutes: task.estimatedMinutes ? String(task.estimatedMinutes) : '',
        notes: task.notes || '',
        subtasks: (task.subtasks || []).map((s) => ({ title: s.title, isDone: Boolean(s.isDone) })),
      });
    } else {
      setForm({ ...EMPTY, dueDate: defaultDue });
    }
    const t = setTimeout(() => titleRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open, task, defaultDue]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const addSub = () => {
    const title = newSub.trim();
    if (!title) return;
    setForm((f) => ({ ...f, subtasks: [...f.subtasks, { title, isDone: false }] }));
    setNewSub('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setErr('Give the task a title.'); titleRef.current?.focus(); return; }
    const minutes = form.estimatedMinutes === '' ? null : Math.max(0, parseInt(form.estimatedMinutes, 10) || 0);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      priority: form.priority,
      status: form.status,
      category: form.category.trim() || 'General',
      dueDate: form.dueDate || null, // '' / null clears it on the server
      notes: form.notes.trim(),
      subtasks: form.subtasks.map((s) => ({ title: s.title, isDone: s.isDone })),
    };
    if (minutes !== null) payload.estimatedMinutes = minutes;
    else if (task) payload.estimatedMinutes = 0;

    setSaving(true);
    setErr('');
    try {
      const res = task ? await api.patch(`/tasks/${task._id}`, payload) : await api.post('/tasks', payload);
      onSaved(res.data, Boolean(task));
    } catch (ex) {
      const msg = formatApiError(ex);
      console.error('[tasks] save failed:', ex);
      setErr(msg);
      onError?.(msg);
    } finally {
      setSaving(false);
    }
  };

  const doneCount = form.subtasks.filter((s) => s.isDone).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={task ? 'Edit task' : 'New task'}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <form onSubmit={submit} className="relative mt-auto flex max-h-[94dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:mt-0 sm:max-h-none sm:max-w-md sm:rounded-none sm:border-l sm:border-slate-200 sm:dark:border-slate-800 lg:max-w-lg">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{task ? 'Edit task' : 'New task'}</h2>
            <p className="text-xs text-slate-500">{task ? 'Changes are saved when you press Save.' : 'Capture it now, refine it later.'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div>
            <label htmlFor="task-title" className={labelCls}>Title</label>
            <input id="task-title" ref={titleRef} value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={200} placeholder="What needs to be done?" className={`${fieldCls} text-base font-medium ${err && !form.title.trim() ? 'border-rose-500' : ''}`} />
          </div>

          <div>
            <label htmlFor="task-desc" className={labelCls}>Description</label>
            <textarea id="task-desc" value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="Add context, links or acceptance criteria…" className={fieldCls} />
          </div>

          <div>
            <span className={labelCls}>Priority</span>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(PRIORITIES).map(([id, p]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => set('priority', id)}
                  aria-pressed={form.priority === id}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${form.priority === id ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                >
                  <span className={`h-2 w-2 rounded-full ${p.dot}`} aria-hidden="true" />{p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="task-status" className={labelCls}>Status</label>
              <select id="task-status" value={form.status} onChange={(e) => set('status', e.target.value)} className={fieldCls}>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="task-cat" className={labelCls}>Category</label>
              <input id="task-cat" list="task-categories" value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="Work, Home…" className={fieldCls} />
              <datalist id="task-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
          </div>

          <div>
            <label htmlFor="task-due" className={labelCls}>Due date</label>
            <input id="task-due" type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} className={fieldCls} />
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip active={form.dueDate === todayKey()} onClick={() => set('dueDate', todayKey())}>Today</Chip>
              <Chip active={form.dueDate === offsetKey(1)} onClick={() => set('dueDate', offsetKey(1))}>Tomorrow</Chip>
              <Chip active={form.dueDate === offsetKey(7)} onClick={() => set('dueDate', offsetKey(7))}>Next week</Chip>
              {form.dueDate && <Chip active={false} onClick={() => set('dueDate', '')}>Clear</Chip>}
            </div>
          </div>

          <div>
            <label htmlFor="task-est" className={labelCls}>Estimated time</label>
            <div className="flex flex-wrap items-center gap-2">
              <input id="task-est" type="number" min="0" inputMode="numeric" value={form.estimatedMinutes} onChange={(e) => set('estimatedMinutes', e.target.value)} placeholder="Minutes" className={`${fieldCls} !w-28`} />
              {[15, 30, 60, 120].map((m) => <Chip key={m} active={form.estimatedMinutes === String(m)} onClick={() => set('estimatedMinutes', String(m))}>{m < 60 ? `${m}m` : `${m / 60}h`}</Chip>)}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className={`${labelCls} !mb-0`}>Subtasks</span>
              {form.subtasks.length > 0 && <span className="text-xs font-semibold tabular-nums text-slate-500">{doneCount}/{form.subtasks.length}</span>}
            </div>
            <ul className="space-y-1.5">
              {form.subtasks.map((s, i) => (
                <li key={i} className="group flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                  <Checkbox done={s.isDone} label={`${s.isDone ? 'Uncheck' : 'Check'} "${s.title}"`} onClick={() => setForm((f) => ({ ...f, subtasks: f.subtasks.map((x, j) => (j === i ? { ...x, isDone: !x.isDone } : x)) }))} />
                  <span className={`flex-1 text-sm ${s.isDone ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}`}>{s.title}</span>
                  <button type="button" aria-label={`Remove "${s.title}"`} onClick={() => setForm((f) => ({ ...f, subtasks: f.subtasks.filter((_, j) => j !== i) }))} className="rounded-md p-1 text-slate-400 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <input
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } }}
                placeholder="Add a subtask and press Enter"
                aria-label="New subtask"
                className={fieldCls}
              />
              <button type="button" onClick={addSub} aria-label="Add subtask" className="shrink-0 rounded-xl border border-slate-200 px-3 text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="task-notes" className={labelCls}>Notes</label>
            <textarea id="task-notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} placeholder="Private notes…" className={fieldCls} />
          </div>
        </div>

        <footer className="border-t border-slate-100 px-5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-4 dark:border-slate-800">
          {err && <p role="alert" className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{err}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-60">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}{task ? 'Save changes' : 'Create task'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
