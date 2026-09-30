import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Play, Pencil, XCircle, Trash2, ExternalLink, MapPin, Users, Clock } from 'lucide-react';
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday,
  startOfDay, startOfMonth, startOfWeek, subDays, differenceInMinutes,
} from 'date-fns';
import { Button, Modal, Spinner } from '../../components/ui.jsx';
import StatusBadge from '../../components/meetings/StatusBadge.jsx';
import ConfirmDialog from '../../components/meetings/ConfirmDialog.jsx';
import { meetingsApi } from '../../api/meetings.js';
import { statusInfo, typeLabel, rangeLabel } from '../../utils/meetingFormat.js';
import { useTenant } from '../../context/TenantContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';

const HOUR = 52; // px per hour in day/week views
const VIEWS = ['day', 'week', 'month'];

const chipClass = (m) => {
  const s = statusInfo(m).key;
  if (s === 'live') return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-800';
  if (s === 'completed') return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800';
  if (s === 'cancelled') return 'bg-slate-100 text-slate-500 line-through border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
  return 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-800';
};

/** Greedy lane assignment so overlapping meetings sit side by side. */
function layout(events) {
  const sorted = [...events].sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  const out = [];
  let cluster = [];
  let clusterEnd = 0;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => out.push({ ...c, lanes }));
    cluster = [];
  };
  for (const ev of sorted) {
    const s = new Date(ev.startAt).getTime();
    const e = new Date(ev.endAt).getTime();
    if (cluster.length && s >= clusterEnd) flush();
    const used = new Set(cluster.filter((c) => new Date(c.ev.endAt).getTime() > s).map((c) => c.lane));
    let lane = 0;
    while (used.has(lane)) lane += 1;
    cluster.push({ ev, lane });
    clusterEnd = Math.max(clusterEnd, e);
  }
  flush();
  return out;
}

export default function MeetingCalendarPage() {
  const navigate = useNavigate();
  const { can } = useTenant();
  const { addToast } = useToast();
  const [view, setView] = useState(() => (window.matchMedia?.('(max-width: 767px)').matches ? 'day' : 'week'));
  const [cursor, setCursor] = useState(new Date());
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // full meeting
  const [loadingSel, setLoadingSel] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'cancel' | 'delete'
  const [scope, setScope] = useState('one');
  const [busy, setBusy] = useState(false);

  const range = useMemo(() => {
    if (view === 'day') return { start: startOfDay(cursor), end: startOfDay(cursor) };
    if (view === 'week') return { start: startOfWeek(cursor), end: endOfWeek(cursor) };
    return { start: startOfWeek(startOfMonth(cursor)), end: endOfWeek(endOfMonth(cursor)) };
  }, [view, cursor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Widen by a day each side: the API filters by UTC day, the grid by local day.
      const res = await meetingsApi.list({
        compact: 'true',
        limit: 300,
        from: format(subDays(range.start, 1), 'yyyy-MM-dd'),
        to: format(addDays(range.end, 1), 'yyyy-MM-dd'),
      });
      setItems(res.data.items);
    } catch (err) {
      addToast(formatApiError(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [range.start.getTime(), range.end.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const step = (dir) => setCursor((c) => (view === 'day' ? addDays(c, dir) : view === 'week' ? addWeeks(c, dir) : addMonths(c, dir)));
  const title = view === 'day' ? format(cursor, 'EEEE, MMM d, yyyy') : view === 'week' ? `${format(range.start, 'MMM d')} – ${format(range.end, 'MMM d, yyyy')}` : format(cursor, 'MMMM yyyy');

  const byDay = useMemo(() => {
    const map = new Map();
    for (const m of items) {
      const key = format(new Date(m.startAt), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    return map;
  }, [items]);

  const open = async (m) => {
    setLoadingSel(true);
    setSelected({ ...m, _partial: true });
    try {
      const res = await meetingsApi.get(m.id);
      setSelected(res.data);
    } catch (err) {
      addToast(formatApiError(err), 'error');
      setSelected(null);
    } finally {
      setLoadingSel(false);
    }
  };

  const newAt = (day, hour = 9) => navigate(`/meetings/new?date=${format(day, 'yyyy-MM-dd')}&time=${String(hour).padStart(2, '0')}:00`);

  const doConfirm = async () => {
    setBusy(true);
    try {
      if (confirm === 'cancel') await meetingsApi.cancel(selected.id);
      else await meetingsApi.remove(selected.id, scope === 'series' ? 'series' : undefined);
      addToast(confirm === 'cancel' ? 'Meeting cancelled' : 'Meeting deleted');
      setConfirm(null);
      setSelected(null);
      load();
    } catch (err) {
      addToast(formatApiError(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const days = view === 'day' ? [cursor] : eachDayOfInterval({ start: range.start, end: range.end }).slice(0, 7);

  const renderGrid = () => (
    <div className="overflow-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 max-h-[68vh]" ref={(el) => { if (el && !el.dataset.scrolled) { el.scrollTop = 7 * HOUR; el.dataset.scrolled = '1'; } }}>
      <div className="min-w-[640px] md:min-w-0">
        <div className="sticky top-0 z-20 grid bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))` }}>
          <div />
          {days.map((d) => (
            <button key={d.toISOString()} type="button" onClick={() => { setCursor(d); setView('day'); }} className={`py-2 text-center text-xs font-semibold ${isToday(d) ? 'text-indigo-600' : 'text-slate-500'}`}>
              {format(d, 'EEE')} <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm ${isToday(d) ? 'bg-indigo-600 text-white' : ''}`}>{format(d, 'd')}</span>
            </button>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))` }}>
          <div>
            {Array.from({ length: 24 }).map((_, h) => (
              <div key={h} style={{ height: HOUR }} className="pr-2 text-right text-[10px] text-slate-400 -translate-y-1.5">{h === 0 ? '' : format(new Date(2000, 0, 1, h), 'h a')}</div>
            ))}
          </div>
          {days.map((d) => {
            const list = layout((byDay.get(format(d, 'yyyy-MM-dd')) || []));
            return (
              <div key={d.toISOString()} className="relative border-l border-slate-100 dark:border-slate-800" style={{ height: HOUR * 24 }}>
                {Array.from({ length: 24 }).map((_, h) => (
                  can('meetings.create')
                    ? <button key={h} type="button" onClick={() => newAt(d, h)} aria-label={`Schedule a meeting on ${format(d, 'MMM d')} at ${h}:00`} style={{ top: h * HOUR, height: HOUR }} className="absolute inset-x-0 border-t border-slate-100 dark:border-slate-800 hover:bg-indigo-50/60 dark:hover:bg-indigo-900/10" />
                    : <div key={h} style={{ top: h * HOUR, height: HOUR }} className="absolute inset-x-0 border-t border-slate-100 dark:border-slate-800" />
                ))}
                {list.map(({ ev, lane, lanes }) => {
                  const s = new Date(ev.startAt);
                  const top = (s.getHours() * 60 + s.getMinutes()) * (HOUR / 60);
                  const h = Math.max(24, differenceInMinutes(new Date(ev.endAt), s) * (HOUR / 60));
                  return (
                    <button key={ev.id} type="button" onClick={() => open(ev)} style={{ top, height: h, left: `${(lane / lanes) * 100}%`, width: `${100 / lanes}%` }}
                      className={`absolute z-10 overflow-hidden rounded-lg border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${chipClass(ev)}`}>
                      <span className="block font-bold truncate">{ev.title}</span>
                      <span className="block opacity-80">{format(s, 'h:mm a')}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderMonth = () => (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 text-center text-[11px] font-semibold uppercase text-slate-400">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {eachDayOfInterval({ start: range.start, end: range.end }).map((d) => {
          const list = byDay.get(format(d, 'yyyy-MM-dd')) || [];
          return (
            <div key={d.toISOString()} className={`min-h-[84px] sm:min-h-[110px] border-b border-r border-slate-100 dark:border-slate-800 p-1 ${isSameMonth(d, cursor) ? '' : 'bg-slate-50/60 dark:bg-slate-950/30 text-slate-400'}`}>
              <button type="button" onClick={() => { setCursor(d); setView('day'); }} className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isToday(d) ? 'bg-indigo-600 text-white' : ''}`} aria-label={`Open ${format(d, 'MMMM d')}`}>{format(d, 'd')}</button>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((m) => (
                  <button key={m.id} type="button" onClick={() => open(m)} className={`block w-full truncate rounded border px-1 py-0.5 text-left text-[10px] sm:text-[11px] font-medium ${chipClass(m)}`}>
                    <span className="hidden sm:inline">{format(new Date(m.startAt), 'h:mma').toLowerCase()} </span>{m.title}
                  </button>
                ))}
                {list.length > 3 && <button type="button" onClick={() => { setCursor(d); setView('day'); }} className="text-[10px] font-semibold text-indigo-600">+{list.length - 3} more</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const sel = selected;
  const isUrl = (v) => /^https?:\/\//i.test(v || '');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => step(-1)} aria-label="Previous" className="p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft className="w-5 h-5" /></button>
          <Button variant="secondary" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
          <button type="button" onClick={() => step(1)} aria-label="Next" className="p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronRight className="w-5 h-5" /></button>
          <h2 className="ml-2 text-base sm:text-lg font-bold text-slate-900 dark:text-white" aria-live="polite">{title}</h2>
          {loading && <Spinner size="sm" className="ml-2" />}
        </div>
        <div role="tablist" aria-label="Calendar view" className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          {VIEWS.map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`px-4 py-2 text-sm font-semibold capitalize ${view === v ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{v}</button>
          ))}
        </div>
      </div>

      {view === 'month' ? renderMonth() : renderGrid()}

      <Modal isOpen={Boolean(sel)} onClose={() => setSelected(null)} title={sel?.title || 'Meeting'}>
        {sel && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2"><StatusBadge meeting={sel} /><span className="text-xs text-slate-500">{typeLabel(sel.type)}</span></div>
            <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><Clock className="w-4 h-4 text-slate-400" aria-hidden="true" />{rangeLabel(sel)}</p>
            {!sel._partial && (
              <>
                <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><Users className="w-4 h-4 text-slate-400" aria-hidden="true" />{(sel.participants || []).map((p) => p.name).join(', ') || 'No participants'}</p>
                {sel.location && (
                  <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 break-all"><MapPin className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                    {isUrl(sel.location) ? <a href={sel.location} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline inline-flex items-center gap-1">{sel.location}<ExternalLink className="w-3 h-3" /></a> : sel.location}
                  </p>
                )}
              </>
            )}
            {loadingSel && <Spinner size="sm" />}
            <div className="flex flex-wrap gap-2 pt-1">
              <Link to={`/meetings/${sel.id}`}><Button variant="secondary" icon={ExternalLink}>Open</Button></Link>
              {!sel._partial && sel.canManage && ['scheduled', 'live'].includes(sel.status) && (
                <Button icon={Play} onClick={() => navigate(`/meetings/${sel.id}/live`)}>{sel.status === 'live' ? 'Join' : 'Start'}</Button>
              )}
              {!sel._partial && sel.canManage && sel.status === 'scheduled' && (
                <>
                  <Link to={`/meetings/${sel.id}/edit`}><Button variant="secondary" icon={Pencil}>Edit</Button></Link>
                  <Button variant="secondary" icon={XCircle} onClick={() => setConfirm('cancel')}>Cancel meeting</Button>
                </>
              )}
              {!sel._partial && sel.canManage && sel.status !== 'live' && can('meetings.delete') && (
                <Button variant="ghost" icon={Trash2} className="text-red-600" onClick={() => { setScope('one'); setConfirm('delete'); }}>Delete</Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        danger
        loading={busy}
        title={confirm === 'cancel' ? 'Cancel this meeting?' : 'Delete this meeting?'}
        message={confirm === 'cancel' ? 'Participants are notified and it is removed from the calendar.' : 'This permanently deletes the meeting, its transcript, action items and recording.'}
        confirmLabel={confirm === 'cancel' ? 'Cancel meeting' : 'Delete'}
        onConfirm={doConfirm}
        onClose={() => setConfirm(null)}
      >
        {confirm === 'delete' && sel?.seriesId && (
          <fieldset className="mt-4 space-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="scope" checked={scope === 'one'} onChange={() => setScope('one')} /> Only this meeting</label>
            <label className="flex items-center gap-2"><input type="radio" name="scope" checked={scope === 'series'} onChange={() => setScope('series')} /> This and all later scheduled meetings in the series</label>
          </fieldset>
        )}
      </ConfirmDialog>

      {can('meetings.create') && (
        <button type="button" onClick={() => newAt(cursor)} aria-label="Schedule meeting" className="md:hidden fixed right-4 bottom-[4.75rem] z-30 h-14 w-14 rounded-full bg-indigo-600 text-white shadow-lg flex items-center justify-center"><Plus className="w-6 h-6" /></button>
      )}
    </div>
  );
}
