import React, { useState } from 'react';
import { MoreHorizontal, Pencil, Play, CheckCircle2, RotateCcw, PauseCircle, Trash2 } from 'lucide-react';

export default function TaskMenu({ task, canDelete, onEdit, onStatus, onDelete, className = '' }) {
  const [open, setOpen] = useState(false);
  const done = task.status === 'completed';

  const items = [
    { key: 'edit', label: 'Edit details', icon: Pencil, run: onEdit },
    !done && task.status !== 'in_progress' && { key: 'start', label: 'Start working', icon: Play, run: () => onStatus('in_progress') },
    !done && { key: 'done', label: 'Mark as done', icon: CheckCircle2, run: () => onStatus('completed') },
    done && { key: 'reopen', label: 'Reopen', icon: RotateCcw, run: () => onStatus('not_started') },
    !done && task.status !== 'postponed' && { key: 'postpone', label: 'Postpone', icon: PauseCircle, run: () => onStatus('postponed') },
    canDelete && { key: 'delete', label: 'Delete', icon: Trash2, run: onDelete, danger: true },
  ].filter(Boolean);

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        aria-label={`Actions for "${task.title}"`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            role="menu"
            className="task-fade absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            {items.map(({ key, label, icon: Icon, run, danger }) => (
              <button
                key={key}
                role="menuitem"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  run?.();
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                  danger
                    ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10'
                    : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
