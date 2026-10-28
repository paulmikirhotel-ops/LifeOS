import React, { useCallback, useEffect, useState } from 'react';
import { WifiOff, Trash2, RefreshCw, Database } from 'lucide-react';
import { Button, Card, Badge, Select, EmptyState } from '../components/ui.jsx';
import { useOffline, saveSettings, refreshUsage, isLowData } from '../offline/status.js';
import { getQueue, discardQueued, retryFailed, clearOfflineCopies, flush } from '../offline/attach.js';
import { formatBytes } from '../offline/logic.js';

function Toggle({ id, label, help, checked, onChange }) {
  return (
    <label htmlFor={id} className="flex items-start justify-between gap-4 py-3 cursor-pointer">
      <span className="min-w-0">
        <span className="block font-medium text-slate-900 dark:text-slate-100">{label}</span>
        <span className="block text-sm text-slate-600 dark:text-slate-400">{help}</span>
      </span>
      <input id={id} type="checkbox" className="mt-1 h-6 w-6 shrink-0 accent-indigo-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

const WHAT = (x) => `${x.kind === 'create' ? 'New' : 'Change to'} ${x.resource.replace(/s$/, '')}${x.data?.title ? `: ${x.data.title}` : x.data?.name ? `: ${x.data.name}` : ''}`;

export default function DataPage() {
  const s = useOffline();
  const [queue, setQueue] = useState([]);
  const [cleared, setCleared] = useState(false);

  const load = useCallback(async () => { setQueue(await getQueue()); refreshUsage(); }, []);
  useEffect(() => { load(); }, [load, s.queued, s.failed]);

  const waiting = queue.filter((x) => !x.failed);
  const failed = queue.filter((x) => x.failed);

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Data and offline</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Control how LifeOS behaves with a weak connection or limited data. These settings stay on this phone.</p>
      </header>

      <Card className="p-4">
        <div className="flex items-center gap-2">
          {s.online ? <Badge variant="success">Online</Badge> : <Badge variant="warning">Offline</Badge>}
          <span className="text-sm text-slate-600 dark:text-slate-400">{isLowData() ? 'Low-data mode is on.' : 'Low-data mode is off.'}</span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
          <div className="py-3">
            <Select
              label="Low-data mode"
              value={s.settings.lowData}
              onChange={(e) => saveSettings({ lowData: e.target.value })}
              options={[
                { value: 'auto', label: 'Automatic (follows Data Saver and slow networks)' },
                { value: 'on', label: 'Always on' },
                { value: 'off', label: 'Always off' },
              ]}
            />
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">When on: pages reuse what you opened in the last 5 minutes instead of asking the server again, and Opportunities does not refresh feeds by itself.</p>
          </div>
          <Toggle id="oc" label="Keep offline copies" checked={s.settings.offlineCopies} onChange={(v) => saveSettings({ offlineCopies: v })}
            help="Tasks, goals, notes, calendar, your NextStep plan and saved opportunities stay readable without signal." />
          <Toggle id="cr" label="Read Connect chats offline" checked={s.settings.connectRead} onChange={(v) => saveSettings({ connectRead: v })}
            help="Stores recent chats on this phone so you can read them without signal. Sending still needs internet. Anyone who can unlock this phone could read them, so leave it off on shared phones." />
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Waiting to upload</h2>
          <Button variant="secondary" size="sm" icon={RefreshCw} loading={s.flushing} onClick={() => flush().then(load)} disabled={!waiting.length}>Try now</Button>
        </div>
        {waiting.length === 0 && failed.length === 0 ? (
          <EmptyState icon={WifiOff} title="Nothing waiting" description="Tasks and notes you add or change without signal will appear here until they upload." />
        ) : null}
        {waiting.map((x) => (
          <div key={x.key} className="flex items-center justify-between gap-3 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
            <div className="min-w-0"><div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{WHAT(x)}</div><div className="text-xs text-slate-500 dark:text-slate-400">Saved on this phone {new Date(x.at).toLocaleString()}</div></div>
            <Button variant="ghost" aria-label="Discard this change" onClick={async () => { await discardQueued(x.key); load(); }}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {failed.length > 0 && <h3 className="font-medium text-red-800 dark:text-red-300 pt-2">Could not be saved</h3>}
        {failed.map((x) => (
          <div key={x.key} className="border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950 rounded-lg px-3 py-2 space-y-2">
            <div className="text-sm font-medium text-red-900 dark:text-red-200">{WHAT(x)}</div>
            <div className="text-sm text-red-800 dark:text-red-300">{x.failed.message}</div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={async () => { await retryFailed(x.key); load(); }}>Try again</Button>
              <Button size="sm" variant="ghost" onClick={async () => { await discardQueued(x.key); load(); }}>Discard</Button>
            </div>
          </div>
        ))}
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"><Database className="h-4 w-4" aria-hidden="true" />Storage</h2>
        <p className="text-sm text-slate-700 dark:text-slate-300">Data used by LifeOS on this phone this month (estimate, answers from the server only): <b>{formatBytes(s.usage)}</b></p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={async () => { await clearOfflineCopies(); setCleared(true); }}>Clear offline copies</Button>
          {cleared && <span className="text-sm text-emerald-700 dark:text-emerald-400">Cleared. Changes waiting to upload were kept.</span>}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Offline copies and waiting changes are removed automatically when you sign out.</p>
      </Card>
    </div>
  );
}
