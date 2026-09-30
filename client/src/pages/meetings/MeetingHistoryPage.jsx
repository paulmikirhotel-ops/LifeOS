import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, History } from 'lucide-react';
import { Button, EmptyState, Input, Select } from '../../components/ui.jsx';
import { RecentMeetingCard } from '../../components/meetings/MeetingCard.jsx';
import { CardSkeleton } from '../../components/meetings/Skeleton.jsx';
import { meetingsApi } from '../../api/meetings.js';
import { MEETING_TYPES } from '../../utils/meetingFormat.js';
import { formatApiError } from '../../utils/errors.js';

const PAGE = 15;
const STATUS = [
  { value: '', label: 'All statuses' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'live', label: 'Live' },
];

/** Searchable archive: title, participant, date, transcript, summary, minutes, notes and action items. */
export default function MeetingHistoryPage() {
  const [f, setF] = useState({ search: '', status: '', type: '', from: '', to: '' });
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const reqId = useRef(0);

  const load = useCallback(async (pg, filters, append) => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await meetingsApi.list({ scope: filters.status ? undefined : 'past', ...filters, page: pg, limit: PAGE });
      if (id !== reqId.current) return; // a newer search superseded this one
      setItems((cur) => (append ? [...cur, ...res.data.items] : res.data.items));
      setTotal(res.data.total);
      setPage(pg);
    } catch (err) {
      if (id === reqId.current) setError(formatApiError(err));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  // Debounce typing; other filters apply immediately.
  useEffect(() => {
    const t = setTimeout(() => load(1, f, false), f.search ? 400 : 0);
    return () => clearTimeout(t);
  }, [f, load]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="relative sm:col-span-2">
          <span className="sr-only">Search meetings</span>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
          <input type="search" value={f.search} onChange={set('search')} placeholder="Search title, person, notes, action item…" maxLength={100}
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white" />
        </label>
        <Select aria-label="Status" options={STATUS} value={f.status} onChange={set('status')} />
        <Select aria-label="Type" options={[{ value: '', label: 'All types' }, ...MEETING_TYPES]} value={f.type} onChange={set('type')} />
        <div className="grid grid-cols-2 gap-2">
          <Input aria-label="From date" type="date" value={f.from} onChange={set('from')} />
          <Input aria-label="To date" type="date" value={f.to} onChange={set('to')} />
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {loading && items.length === 0 ? (
        <CardSkeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyState icon={History} title={f.search ? 'No meetings match your search' : 'No meetings yet'} description={f.search ? 'Try a different keyword, or clear the filters.' : 'Past meetings appear here.'} />
      ) : (
        <>
          <p className="text-xs text-slate-500" aria-live="polite">{total} meeting{total === 1 ? '' : 's'}</p>
          <div className="grid gap-3 md:grid-cols-2">{items.map((m) => <RecentMeetingCard key={m.id} meeting={m} />)}</div>
          {items.length < total && (
            <div className="flex justify-center"><Button variant="secondary" loading={loading} onClick={() => load(page + 1, f, true)}>Load more</Button></div>
          )}
        </>
      )}
    </div>
  );
}
