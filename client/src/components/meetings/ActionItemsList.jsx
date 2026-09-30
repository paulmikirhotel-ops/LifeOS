import React, { useState } from 'react';
import { Plus, Trash2, ListPlus, Loader2, CheckSquare } from 'lucide-react';
import { Button, Badge, Input, Select, EmptyState } from '../ui.jsx';
import { meetingsApi } from '../../api/meetings.js';
import { ACTION_STATUS_LABELS, PRIORITY_LABELS } from '../../utils/meetingFormat.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';
import { format } from 'date-fns';

const statusOptions = Object.entries(ACTION_STATUS_LABELS).map(([value, label]) => ({ value, label }));
const priorityOptions = Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }));

/** Editable list of a meeting's action items with "Add to LifeOS Tasks". */
export default function ActionItemsList({ meetingId, items, canManage, canCreateTasks, onChange, onJumpToSeq }) {
  const { addToast } = useToast();
  const [draft, setDraft] = useState({ task: '', assigneeName: '', deadline: '', priority: 'medium' });
  const [busy, setBusy] = useState(null);

  const guard = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
      await onChange();
    } catch (err) {
      addToast(formatApiError(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const add = (e) => {
    e.preventDefault();
    if (!draft.task.trim()) return;
    guard('add', async () => {
      await meetingsApi.createActionItem(meetingId, {
        task: draft.task.trim(),
        assigneeName: draft.assigneeName.trim() || undefined,
        deadline: draft.deadline || undefined,
        priority: draft.priority,
      });
      setDraft({ task: '', assigneeName: '', deadline: '', priority: 'medium' });
    });
  };

  const unlinked = items.filter((i) => !i.taskId && ['pending', 'in_progress'].includes(i.status));

  return (
    <div className="space-y-4">
      {canManage && canCreateTasks && unlinked.length > 0 && (
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" icon={ListPlus} loading={busy === 'bulk'} onClick={() => guard('bulk', async () => { const r = await meetingsApi.tasksFromItems(meetingId); addToast(`${r.data.created} task(s) added to LifeOS Tasks`); })}>
            Add all to Tasks
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState icon={CheckSquare} title="No action items" description="Action items found by AI, or added by you, appear here." />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800">
          {items.map((i) => (
            <li key={i.id} className="p-3 sm:p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <p className={`text-sm font-medium ${i.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>{i.task}</p>
                <div className="flex items-center gap-1.5 shrink-0">
                  {i.source === 'ai' && <Badge variant="info">AI</Badge>}
                  {i.taskId && <Badge variant="success">In Tasks</Badge>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>Assigned: <b className="text-slate-700 dark:text-slate-300">{i.assigneeName || 'Unassigned'}</b></span>
                <span>Due: <b className="text-slate-700 dark:text-slate-300">{i.deadline ? format(new Date(i.deadline), 'MMM d, yyyy') : i.deadlineText || 'No deadline'}</b></span>
                <span>Priority: <b className="text-slate-700 dark:text-slate-300">{PRIORITY_LABELS[i.priority]}</b></span>
                {i.source === 'ai' && Number.isInteger(i.sourceSeq) && onJumpToSeq && (
                  <button type="button" className="text-indigo-600 hover:underline" onClick={() => onJumpToSeq(i.sourceSeq)}>Show in transcript</button>
                )}
              </div>
              {canManage && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <select
                    aria-label="Status"
                    value={i.status}
                    onChange={(e) => guard(`s${i.id}`, () => meetingsApi.updateActionItem(meetingId, i.id, { status: e.target.value }))}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs dark:text-white min-h-[36px]"
                  >
                    {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {canCreateTasks && !i.taskId && (
                    <Button variant="ghost" size="sm" icon={busy === `t${i.id}` ? Loader2 : ListPlus} onClick={() => guard(`t${i.id}`, async () => { await meetingsApi.taskFromItem(meetingId, i.id); addToast('Added to LifeOS Tasks'); })}>
                      Add to Tasks
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" icon={Trash2} className="text-red-600" onClick={() => guard(`d${i.id}`, () => meetingsApi.removeActionItem(meetingId, i.id))} aria-label={`Delete action item: ${i.task}`}>
                    Delete
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form onSubmit={add} className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-3 sm:p-4 space-y-3">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Add action item</p>
          <Input label="Task" value={draft.task} onChange={(e) => setDraft({ ...draft, task: e.target.value })} placeholder="e.g. Complete database design" maxLength={300} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Assigned to" value={draft.assigneeName} onChange={(e) => setDraft({ ...draft, assigneeName: e.target.value })} maxLength={120} />
            <Input label="Deadline" type="date" value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} />
            <Select label="Priority" options={priorityOptions} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} />
          </div>
          <Button type="submit" icon={Plus} loading={busy === 'add'} disabled={!draft.task.trim()}>Add</Button>
        </form>
      )}
    </div>
  );
}
