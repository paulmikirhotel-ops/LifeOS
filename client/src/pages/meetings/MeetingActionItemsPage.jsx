import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckSquare } from 'lucide-react';
import { format } from 'date-fns';
import { Badge, EmptyState, Select } from '../../components/ui.jsx';
import { CardSkeleton } from '../../components/meetings/Skeleton.jsx';
import { meetingsApi } from '../../api/meetings.js';
import { ACTION_STATUS_LABELS, PRIORITY_LABELS } from '../../utils/meetingFormat.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';

const STATUS_FILTER = [{ value: '', label: 'All statuses' }, ...Object.entries(ACTION_STATUS_LABELS).map(([value, label]) => ({ value, label }))];

/** Action items across every meeting you can access. Editing follows meeting permissions. */
export default function MeetingActionItemsPage() {
  const { addToast } = useToast();
  const [status, setStatus] = useState('pending');
  const [mine, setMine] = useState(false);
  const [items, setItems] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await meetingsApi.allActionItems({ status, mine: mine ? 'true' : undefined });
      setItems(res.data.items);
    } catch (err) {
      addToast(formatApiError(err), 'error');
      setItems([]);
    }
  }, [status, mine]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setItems(null); load(); }, [load]);

  const change = async (item, next) => {
    try {
      await meetingsApi.updateActionItem(item.meetingId, item.id, { status: next });
      load();
    } catch (err) {
      addToast(err?.code === 'FORBIDDEN' ? 'Only the meeting organizer can change action items.' : formatApiError(err), 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-48"><Select label="Status" options={STATUS_FILTER} value={status} onChange={(e) => setStatus(e.target.value)} /></div>
        <label className="flex items-center gap-2 pb-2.5 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="h-4 w-4 accent-indigo-600" /> Assigned to me
        </label>
      </div>

      {items === null ? (
        <CardSkeleton />
      ) : items.length === 0 ? (
        <EmptyState icon={CheckSquare} title="No action items" description="Action items from your meetings show up here." />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          {items.map((i) => (
            <li key={i.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className={`text-sm font-medium ${i.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>{i.task}</p>
                <p className="mt-1 text-xs text-slate-500">
                  <Link to={`/meetings/${i.meetingId}?tab=actions`} className="text-indigo-600 hover:underline">{i.meetingTitle || 'Meeting'}</Link>
                  {' · '}{i.assigneeName || 'Unassigned'}
                  {' · '}{i.deadline ? format(new Date(i.deadline), 'MMM d') : i.deadlineText || 'No deadline'}
                  {' · '}{PRIORITY_LABELS[i.priority]}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {i.taskId && <Badge variant="success">In Tasks</Badge>}
                <select aria-label={`Status of ${i.task}`} value={i.status} onChange={(e) => change(i, e.target.value)} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2 text-sm min-h-[40px] dark:text-white">
                  {Object.entries(ACTION_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
