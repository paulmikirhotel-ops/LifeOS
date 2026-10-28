import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, Settings2, Scale } from 'lucide-react';
import { lifeApi, describeAnswer } from '../../api/life.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useTenant } from '../../context/TenantContext.jsx';
import { formatApiError } from '../../utils/errors.js';
import { Button, Card, Input, Select, Spinner, EmptyState, Modal } from '../../components/ui.jsx';

const EVENT_LABEL = { work: 'Work', school: 'School', meeting: 'Meetings', study: 'Study', exercise: 'Exercise', personal: 'Personal', appointment: 'Appointments', other: 'Other' };
const SUGGEST = ['Work', 'Learning', 'Health', 'Family', 'Rest'];
const COLORS = ['bg-indigo-600', 'bg-sky-600', 'bg-amber-600', 'bg-rose-600', 'bg-emerald-600', 'bg-violet-600'];
const hm = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);
const todayStr = () => new Date().toISOString().slice(0, 10);
const shiftWeek = (ws, n) => { const d = new Date(`${ws}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 7 * n); return d.toISOString().slice(0, 10); };
const niceRange = (a, b) => `${new Date(`${a}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })} to ${new Date(`${b}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;

export default function BalanceTab() {
  const { addToast } = useToast();
  const { can } = useTenant();
  const canWrite = can('goals.create');
  const [week, setWeek] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [manage, setManage] = useState(false);
  const [areaId, setAreaId] = useState('');
  const [minutes, setMinutes] = useState('30');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [newName, setNewName] = useState('');
  const [newTarget, setNewTarget] = useState('');

  const load = useCallback(async (w) => {
    try {
      setError('');
      const d = await lifeApi.balance(w || undefined);
      if (!d || !Array.isArray(d.areas) || !Array.isArray(d.entries)) throw new Error(`Unexpected answer from the server (${describeAnswer(d)}).`);
      setData(d);
    } catch (e) { setError(e?.response ? formatApiError(e) : String(e?.message || e)); }
  }, []);
  useEffect(() => { load(week); }, [load, week]);
  useEffect(() => { if (data?.areas?.length && !data.areas.find((a) => a.areaId === areaId)) setAreaId(data.areas[0].areaId); }, [data, areaId]);

  const nameOf = useMemo(() => Object.fromEntries((data?.areas || []).map((a) => [a.areaId, a.name])), [data]);
  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); if (ok) addToast(ok); await load(week); } catch (e) { addToast(formatApiError(e)); } finally { setBusy(false); }
  };

  if (error) return <Card className="p-4 text-red-700 dark:text-red-300">{error} <Button variant="secondary" onClick={() => load(week)}>Try again</Button></Card>;
  if (!data) return <div className="flex justify-center p-8"><Spinner /></div>;

  const isThisWeek = data.weekStart <= todayStr() && todayStr() <= data.weekEnd;
  const total = data.areas.reduce((s, a) => s + a.minutes, 0);
  const addArea = (name, target) => run(() => lifeApi.addArea({ name, targetMinutes: Math.round((Number(target) || 0) * 60) }), 'Area added');

  return (
    <div className="space-y-4">
      {!data.hasAreas ? (
        <Card className="p-4 space-y-3">
          <EmptyState icon={Scale} title="Choose what you want to keep track of" description="Pick your own areas of life. There is no right answer, and nothing is filled in for you." />
          <div className="flex flex-wrap gap-2 justify-center">
            {SUGGEST.map((n) => <Button key={n} variant="secondary" disabled={!canWrite || busy} onClick={() => addArea(n, 0)}>{n}</Button>)}
          </div>
          <form className="flex flex-wrap gap-2 items-end justify-center" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) { addArea(newName.trim(), newTarget); setNewName(''); setNewTarget(''); } }}>
            <Input label="Or your own area" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} />
            <Button type="submit" icon={Plus} disabled={!canWrite || busy || !newName.trim()}>Add</Button>
          </form>
        </Card>
      ) : (
        <>
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" aria-label="Previous week" onClick={() => setWeek(shiftWeek(data.weekStart, -1))}><ChevronLeft className="h-4 w-4" /></Button>
              <div className="text-center">
                <div className="font-semibold text-slate-900 dark:text-slate-100">{isThisWeek ? 'This week' : 'Week'}</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">{niceRange(data.weekStart, data.weekEnd)}</div>
              </div>
              <Button variant="ghost" aria-label="Next week" disabled={isThisWeek} onClick={() => setWeek(shiftWeek(data.weekStart, 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            {total === 0 && <p className="text-sm text-slate-600 dark:text-slate-400">Nothing logged this week yet. Add time below and it will show here.</p>}
            <ul className="space-y-3">
              {data.areas.map((a, i) => {
                const pct = a.target ? Math.min(100, Math.round((a.minutes / a.target) * 100)) : a.minutes ? 100 : 0;
                return (
                  <li key={a.areaId}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium text-slate-900 dark:text-slate-100">{a.name}</span>
                      <span className="text-slate-600 dark:text-slate-400">{hm(a.minutes)}{a.target ? ` of ${hm(a.target)}` : ''}</span>
                    </div>
                    <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden" role="img" aria-label={`${a.name}: ${hm(a.minutes)}${a.target ? ` of ${hm(a.target)} target` : ', no target set'}`}>
                      <div className={`h-full ${COLORS[i % COLORS.length]}`} style={{ width: `${pct}%` }} />
                    </div>
                    {a.auto > 0 && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Includes {hm(a.auto)} from finished tasks and calendar{a.manual ? ` and ${hm(a.manual)} you logged` : ''}.</div>}
                    {data.tasksWithoutMinutes?.[a.areaId] > 0 && <div className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">{data.tasksWithoutMinutes[a.areaId]} finished task(s) have no minutes, so they are not counted. Add actual or estimated minutes to a task to include it.</div>}
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Your usual over the last 4 weeks: {hm(a.previousAverage)} a week{a.target ? '' : '. No target set.'}</div>
                  </li>
                );
              })}
            </ul>
            {data.notes.map((n) => <p key={n.areaId} className="text-sm rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-100 p-3">{n.text}</p>)}
            <div className="flex justify-end"><Button variant="ghost" size="sm" icon={Settings2} onClick={() => setManage(true)}>Areas and targets</Button></div>
          </Card>

          {canWrite && (
            <Card className="p-4">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Add time</h2>
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => lifeApi.addLog({ areaId, minutes: Number(minutes), date, note }), 'Added').then(() => setNote('')); }}>
                <Select label="Area" value={areaId} onChange={(e) => setAreaId(e.target.value)} options={data.areas.map((a) => ({ value: a.areaId, label: a.name }))} />
                <Input label="Date" type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
                <div className="sm:col-span-2 flex flex-wrap gap-2 items-end">
                  {[15, 30, 60, 120].map((m) => <Button key={m} type="button" variant={String(m) === minutes ? 'primary' : 'secondary'} onClick={() => setMinutes(String(m))}>{hm(m)}</Button>)}
                  <Input label="Minutes" type="number" min="1" max="1440" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                </div>
                <div className="sm:col-span-2"><Input label="Note (optional)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></div>
                <div className="sm:col-span-2"><Button type="submit" loading={busy} disabled={!areaId || !(Number(minutes) >= 1)}>Add</Button></div>
              </form>
            </Card>
          )}

          <Card className="p-4">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Logged this week</h2>
            {data.entries.length === 0 ? <p className="text-sm text-slate-600 dark:text-slate-400">Nothing yet.</p> : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.entries.map((e) => (
                  <li key={e._id} className="py-2 flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0"><b className="text-slate-900 dark:text-slate-100">{nameOf[e.areaId] || 'Area'}</b> · {hm(e.minutes)} · {e.date}{e.note ? <span className="text-slate-500 dark:text-slate-400"> · {e.note}</span> : null}</span>
                    {canWrite && <Button variant="ghost" aria-label="Delete this entry" onClick={() => run(() => lifeApi.removeLog(e._id))}><Trash2 className="h-4 w-4" /></Button>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">This is a mirror of the time you choose to log. It is not medical or mental-health advice.</p>

      <Modal isOpen={manage} onClose={() => setManage(false)} title="Areas and targets">
        <div className="space-y-3">
          {data.areas.map((a) => (
            <div key={a.areaId} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[8rem]"><Input label="Area" defaultValue={a.name} maxLength={40} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== a.name && run(() => lifeApi.updateArea(a.areaId, { name: e.target.value.trim() }))} /></div>
                <div className="w-32"><Input label="Target, hours a week" type="number" min="0" max="168" step="0.5" defaultValue={a.target / 60} onBlur={(e) => run(() => lifeApi.updateArea(a.areaId, { targetMinutes: Math.round((Number(e.target.value) || 0) * 60) }))} /></div>
                <Button variant="ghost" aria-label={`Delete ${a.name}`} onClick={() => { if (window.confirm(`Delete "${a.name}" and everything logged under it?`)) run(() => lifeApi.removeArea(a.areaId), 'Area deleted'); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <AutoSources area={a} types={data.eventTypes} tasksOk={data.autoAvailable?.tasks} eventsOk={data.autoAvailable?.events} onChange={(patch) => run(() => lifeApi.updateArea(a.areaId, patch))} />
            </div>
          ))}
          <form className="flex flex-wrap items-end gap-2 border-t border-slate-200 dark:border-slate-700 pt-3" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) { addArea(newName.trim(), newTarget); setNewName(''); setNewTarget(''); } }}>
            <div className="flex-1 min-w-[8rem]"><Input label="New area" value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} /></div>
            <div className="w-32"><Input label="Target, hours" type="number" min="0" max="168" step="0.5" value={newTarget} onChange={(e) => setNewTarget(e.target.value)} /></div>
            <Button type="submit" icon={Plus} disabled={!newName.trim() || busy}>Add</Button>
          </form>
          <p className="text-xs text-slate-500 dark:text-slate-400">A target is your own goal for a week. Leave it at 0 for no target.</p>
        </div>
      </Modal>
    </div>
  );
}

function AutoSources({ area, types = [], tasksOk, eventsOk, onChange }) {
  const picked = new Set(area.eventTypes || []);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-slate-700 dark:text-slate-300">Take time from tasks and calendar automatically{(area.eventTypes?.length || area.taskCategories?.length) ? ' (on)' : ''}</summary>
      <div className="mt-2 space-y-3">
        {tasksOk && (
          <Input label="Finished tasks with these categories (separate with commas)" defaultValue={(area.taskCategories || []).join(', ')}
            onBlur={(e) => onChange({ taskCategories: e.target.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10) })} />
        )}
        {eventsOk && (
          <fieldset>
            <legend className="text-slate-700 dark:text-slate-300 mb-1">Calendar events that have ended, of these types</legend>
            <div className="flex flex-wrap gap-2">
              {types.map((t) => (
                <label key={t} className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 px-3 py-1">
                  <input type="checkbox" className="accent-indigo-600" checked={picked.has(t)} onChange={(e) => { const next = new Set(picked); if (e.target.checked) next.add(t); else next.delete(t); onChange({ eventTypes: [...next] }); }} />
                  {EVENT_LABEL[t] || t}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">Finished tasks count their actual minutes, or the estimate if there are none, on the day they were completed. Events count their length on the day they started. All-day events and tasks without minutes are not counted. Each task or event goes to one area only, the first that matches.</p>
      </div>
    </details>
  );
}
