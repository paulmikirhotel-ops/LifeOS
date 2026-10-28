import React, { useState } from 'react';
import { Check, Clock, Pencil, Trash2, ChevronDown, Calendar } from 'lucide-react';
import { DUE_TONES, dueInfo, formatMinutes, isClosed, isDone, priorityOf, statusLabel, subtaskProgress } from '../../utils/taskHelpers.js';

export function Checkbox({ done, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={done}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-transparent hover:border-emerald-500 hover:text-emerald-500/60 dark:border-slate-600'}`}
    >
      <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
    </button>
  );
}

export function Pill({ className = '', children, icon: Icon }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${className}`}>
      {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** One task in the list view. */
export default function TaskRow({ task, today, onToggle, onOpen, onDelete, onToggleSubtask }) {
  const [open, setOpen] = useState(false);
  const pri = priorityOf(task);
  const due = dueInfo(task, today);
  const sub = subtaskProgress(task);
  const done = isDone(task);
  const closed = isClosed(task);

  return (
    <li className={`group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition hover:border-indigo-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/40 ${closed ? 'opacity-70' : ''}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${closed ? 'bg-slate-300 dark:bg-slate-700' : pri.bar}`} aria-hidden="true" />
      <div className="flex items-start gap-3 py-3.5 pl-5 pr-3 sm:items-center sm:gap-4">
        <div className="pt-0.5 sm:pt-0">
          <Checkbox done={done} onClick={() => onToggle(task)} label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`} />
        </div>

        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => onOpen(task)} className="block w-full text-left focus:outline-none focus-visible:underline">
            <span className={`block truncate text-[15px] font-semibold text-slate-900 dark:text-white ${closed ? 'text-slate-400 line-through dark:text-slate-500' : ''}`}>{task.title}</span>
          </button>
          {task.description && !closed && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{task.description}</p>}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {due && <Pill icon={Calendar} className={DUE_TONES[due.tone]}>{due.text}</Pill>}
            {!closed && <Pill className={pri.pill}><span className={`h-1.5 w-1.5 rounded-full ${pri.dot}`} aria-hidden="true" />{pri.label}</Pill>}
            {task.status === 'in_progress' && <Pill className="bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/25">In progress</Pill>}
            {(task.status === 'postponed' || task.status === 'cancelled') && <Pill className="bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">{statusLabel(task.status)}</Pill>}
            {task.estimatedMinutes > 0 && <Pill icon={Clock} className="bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">{formatMinutes(task.estimatedMinutes)}</Pill>}
            {task.category && <span className="px-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">#{task.category}</span>}
            {sub.total > 0 && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true">
                  <span className="block h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${sub.pct}%` }} />
                </span>
                {sub.done}/{sub.total}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          <button type="button" onClick={() => onOpen(task)} aria-label={`Edit "${task.title}"`} title="Edit" className="rounded-lg p-2 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-indigo-500/10">
            <Pencil className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onDelete(task)} aria-label={`Delete "${task.title}"`} title="Delete" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:hover:bg-rose-500/10">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {open && sub.total > 0 && (
        <ul className="space-y-1 border-t border-slate-100 bg-slate-50/70 px-5 py-2.5 dark:border-slate-800 dark:bg-slate-950/40">
          {task.subtasks.map((s, i) => (
            <li key={s._id || i} className="flex items-center gap-2.5 pl-1">
              <Checkbox done={s.isDone} onClick={() => onToggleSubtask(task, i)} label={`${s.isDone ? 'Uncheck' : 'Check'} "${s.title}"`} />
              <span className={`text-sm ${s.isDone ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}`}>{s.title}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
