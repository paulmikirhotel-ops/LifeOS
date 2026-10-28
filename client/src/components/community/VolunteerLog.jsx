import React, { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { communityApi } from '../../api/community.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';
import { Button, Card, Spinner, Input, EmptyState } from '../ui.jsx';

const today = () => new Date().toISOString().slice(0, 10);

/** The person's own diary. Everything starts private. Sharing is a separate tick on each entry, and only the hour total is ever shown. */
export default function VolunteerLog() {
  const { addToast } = useToast();
  const [data, setData] = useState(null);
  const [f, setF] = useState({ title: '', hours: '1', date: today(), note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(() => communityApi.log().then((r) => setData(r.data)).catch((e) => { setError(formatApiError(e)); setData({ items: [], totalHours: 0, sharedHours: 0 }); }), []);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const add = async () => {
    setBusy(true); setError('');
    try {
      await communityApi.addLog({ title: f.title, hours: Number(f.hours), date: f.date, note: f.note || undefined });
      setF({ title: '', hours: '1', date: today(), note: '' });
      addToast('Saved. It is private until you tick "Share".');
      load();
    } catch (e) { setError(formatApiError(e)); } finally { setBusy(false); }
  };
  const share = async (e) => {
    const next = !e.shared;
    if (next && !window.confirm('Share this entry? Other people will see only the total of your shared hours on your community profile, not the title or note. You can undo this any time.')) return;
    try { await communityApi.updateLog(e.id, { shared: next }); load(); } catch (err) { addToast(formatApiError(err), 'error'); }
  };
  const remove = async (e) => { if (!window.confirm('Delete this entry?')) return; try { await communityApi.removeLog(e.id); load(); } catch (err) { addToast(formatApiError(err), 'error'); } };

  if (!data) return <div className="flex justify-center py-10"><Spinner /></div>;
  return (
    <div className="space-y-4">
      <Card className="space-y-1 p-4">
        <p className="font-medium">My volunteering log</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">Total: <strong>{data.totalHours} h</strong> · Shared on my profile: <strong>{data.sharedHours} h</strong></p>
        <p className="text-xs text-slate-500">These are hours you record yourself. LifeOS does not check them. Nothing is public unless you tick "Share" on an entry, and even then only the total hours are shown.</p>
      </Card>
      <Card className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3"><Input label="What did you do?" value={f.title} maxLength={100} onChange={set('title')} /></div>
          <Input label="Hours" type="number" min="0.25" max="24" step="0.25" value={f.hours} onChange={set('hours')} />
          <Input label="Date" type="date" max={today()} value={f.date} onChange={set('date')} />
          <Input label="Note (optional)" value={f.note} maxLength={200} onChange={set('note')} />
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <Button loading={busy} disabled={f.title.trim().length < 2 || !(Number(f.hours) >= 0.25)} onClick={add}>Add entry</Button>
      </Card>
      {data.items.length === 0 ? <EmptyState icon={Trash2} title="No entries yet" description="Add the time you give to others. It stays private by default." /> : (
        <ul className="space-y-2">
          {data.items.map((e) => (
            <li key={e.id}><Card className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0"><p className="truncate text-sm font-medium">{e.title}</p><p className="text-xs text-slate-500">{new Date(e.date).toLocaleDateString(undefined, { timeZone: 'UTC' })} · {e.hours} h{e.note ? ` · ${e.note}` : ''}</p></div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={e.shared} onChange={() => share(e)} /> Share</label>
                <Button size="sm" variant="ghost" aria-label={`Delete ${e.title}`} onClick={() => remove(e)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </Card></li>
          ))}
        </ul>
      )}
    </div>
  );
}
