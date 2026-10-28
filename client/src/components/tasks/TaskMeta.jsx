import React from 'react';
import { Calendar, Clock, ListChecks, Tag } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { STATUS_META, bucketOf, dueKey, formatDue, formatMinutes, isClosed, subtaskProgress } from '../../utils/tasks.js';

const TONES = {
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  indigo: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
};

function Chip({ icon: Icon, tone = 'slate', className = '', children }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium leading-5 ${TONES[tone] || ''} ${className}`}
    >
      {Icon && <Icon className="h-3 w-3 flex-shrink-0" />}
      <span className="truncate">{children}</span>
    </span>
  );
}

export default function TaskMeta({ task, today }) {
  const key = dueKey(task);
  const bucket = bucketOf(task, today);
  const sub = subtaskProgress(task);
  const showStatus = ['in_progress', 'postponed', 'cancelled'].includes(task.status);
  const dueTone = bucket === 'overdue' ? 'rose' : bucket === 'today' ? 'indigo' : 'slate';

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {showStatus && <Chip className={STATUS_META[task.status].chip}>{STATUS_META[task.status].label}</Chip>}
      {key && (
        <Chip icon={Calendar} tone={dueTone}>
          {isClosed(task) ? format(parseISO(key), 'MMM d') : formatDue(key, today)}
        </Chip>
      )}
      {task.estimatedMinutes > 0 && <Chip icon={Clock}>{formatMinutes(task.estimatedMinutes)}</Chip>}
      {sub.total > 0 && (
        <Chip icon={ListChecks}>
          {sub.done}/{sub.total}
        </Chip>
      )}
      {task.category && (
        <Chip icon={Tag} tone="violet" className="max-w-[9rem]">
          {task.category}
        </Chip>
      )}
    </span>
  );
}
