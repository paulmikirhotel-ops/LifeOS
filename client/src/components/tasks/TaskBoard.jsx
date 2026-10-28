import React, { useState } from 'react';
import { Calendar, Clock } from 'lucide-react';
import { DUE_TONES, dueInfo, formatMinutes, priorityOf, STATUSES, subtaskProgress } from '../../utils/taskHelpers.js';
import { Checkbox, Pill } from './TaskRow.jsx';

const COLUMNS = [
  { id: 'not_started', title: 'To do', accent: 'bg-slate-400', match: (s) => s === 'not_started' || s === 'postponed' },
  { id: 'in_progress', title: 'In progress', accent: 'bg-violet-500', match: (s) => s === 'in_progress' },
  { id: 'completed', title: 'Done', accent: 'bg-emerald-500', match: (s) => s === 'completed' },
];

function Card({ task, today, onOpen, onToggle, onMove }) {
  const pri = priorityOf(task);
  const due = dueInfo(task, today);
  const sub = subtaskProgress(task);
  const done = task.status === 'completed';
  return (
    <li
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/task-id', task._id); e.dataTransfer.effectAllowed = 'move'; }}
      className={`cursor-grab rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm transition hover:border-indigo-200 hover:shadow-md active:cursor-grabbing dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/40 ${done ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start gap-2.5">
        <div className="pt-px"><Checkbox done={done} onClick={() => onToggle(task)} label={done ? 'Mark as not done' : 'Mark as done'} /></div>
        <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left focus:outline-none focus-visible:underline">
          <span className={`block text-sm font-semibold ${done ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-white'}`}>{task.title}</span>
        </button>
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${pri.dot}`} title={`${pri.label} priority`} aria-label={`${pri.label} priority`} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-8">
        {due && <Pill icon={Calendar} className={DUE_TONES[due.tone]}>{due.text}</Pill>}
        {task.estimatedMinutes > 0 && <Pill icon={Clock} className="bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">{formatMinutes(task.estimatedMinutes)}</Pill>}
        {sub.total > 0 && <span className="text-[11px] font-semibold text-slate-500">{sub.done}/{sub.total}</span>}
      </div>
      <div className="mt-2.5 pl-8">
        <label className="sr-only" htmlFor={`mv-${task._id}`}>Move task</label>
        <select
          id={`mv-${task._id}`}
          value={COLUMNS.find((c) => c.match(task.status))?.id || 'not_started'}
          onChange={(e) => onMove(task, e.target.value)}
          className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-[11px] font-medium text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          {STATUSES.filter((s) => COLUMNS.some((c) => c.id === s.value)).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
    </li>
  );
}

/** Kanban view. Drag a card to another column (or use the small selector on touch screens). */
export default function TaskBoard({ tasks, today, onOpen, onToggle, onMove }) {
  const [over, setOver] = useState(null);
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const items = tasks.filter((t) => col.match(t.status));
        return (
          <section
            key={col.id}
            aria-label={col.title}
            onDragOver={(e) => { e.preventDefault(); setOver(col.id); }}
            onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData('text/task-id');
              const task = tasks.find((t) => t._id === id);
              if (task && !col.match(task.status)) onMove(task, col.id);
            }}
            className={`rounded-2xl border p-3 transition ${over === col.id ? 'border-indigo-400 bg-indigo-50/70 dark:bg-indigo-500/10' : 'border-slate-200/80 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/50'}`}
          >
            <header className="mb-3 flex items-center justify-between px-1">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                <span className={`h-2 w-2 rounded-full ${col.accent}`} aria-hidden="true" />{col.title}
              </h3>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold tabular-nums text-slate-500 shadow-sm dark:bg-slate-800">{items.length}</span>
            </header>
            <ul className="min-h-[4rem] space-y-2.5">
              {items.map((t) => <Card key={t._id} task={t} today={today} onOpen={onOpen} onToggle={onToggle} onMove={onMove} />)}
              {!items.length && <li className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400 dark:border-slate-700">Nothing here</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
