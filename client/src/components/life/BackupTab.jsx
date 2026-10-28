import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Upload, ShieldCheck } from 'lucide-react';
import { lifeApi, describeAnswer } from '../../api/life.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useTenant } from '../../context/TenantContext.jsx';
import { formatApiError } from '../../utils/errors.js';
import { Button, Card, Spinner } from '../../components/ui.jsx';

const LABEL = { tasks: 'Tasks', goals: 'Goals', knowledge: 'Knowledge entries', areas: 'Life areas', balanceLogs: 'Logged time', radarSources: 'Opportunity feeds', radarKeywords: 'Opportunity keywords' };
const when = (d) => (d ? new Date(d).toLocaleString() : 'never');

export default function BackupTab() {
  const { addToast } = useToast();
  const { can } = useTenant();
  const canWrite = can('goals.create');
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null); // { name, text }
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(null);
  const input = useRef(null);

  const load = useCallback(async () => { try {
      setError('');
      const d = await lifeApi.backupInfo();
      if (!d || typeof d.reminder !== 'boolean') throw new Error(`Unexpected answer from the server (${describeAnswer(d)}).`);
      setInfo(d);
    } catch (e) { setError(e?.response ? formatApiError(e) : String(e?.message || e)); } }, []);
  useEffect(() => { load(); }, [load]);

  const download = async () => {
    setBusy(true);
    try {
      const backup = await lifeApi.exportBackup();
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `lifeos-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      addToast('Backup downloaded');
      await load();
    } catch (e) { addToast(formatApiError(e)); } finally { setBusy(false); }
  };

  const choose = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    setPreview(null); setDone(null); setFile(null);
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { addToast('That file is too large to be a LifeOS backup.'); return; }
    const text = await f.text();
    setBusy(true);
    try { setPreview(await lifeApi.previewRestore(text)); setFile({ name: f.name, text }); } catch (err) { addToast(formatApiError(err)); } finally { setBusy(false); }
  };
  const restore = async () => {
    setBusy(true);
    try { const r = await lifeApi.restore(file.text); setDone(r.restored); setPreview(null); setFile(null); await load(); addToast('Restore finished'); } catch (err) { addToast(formatApiError(err)); } finally { setBusy(false); }
  };

  if (error) return <Card className="p-4 text-red-700 dark:text-red-300">{error} <Button variant="secondary" onClick={load}>Try again</Button></Card>;
  if (!info) return <div className="flex justify-center p-8"><Spinner /></div>;

  const counts = (c) => Object.keys(LABEL).filter((k) => c[k] && (c[k].add || c[k].skip || c[k].overLimit || c[k].noArea || c[k].rejected));

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"><Download className="h-4 w-4" aria-hidden="true" />Back up my data</h2>
        <p className="text-sm text-slate-700 dark:text-slate-300">Downloads one file with the tasks and goals you created, your Knowledge entries, life areas and logged time, and your Opportunity feeds and keywords. Your own data in this workspace only.</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">Not included: passwords, sign-in details, other people's data, Connect chats, meetings, calendar events and tasks other people created.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={Download} loading={busy} onClick={download}>Download backup file</Button>
          <span className="text-sm text-slate-600 dark:text-slate-400">Last backup: {when(info.lastBackupAt)}</span>
        </div>
        <label className="flex items-center gap-3 text-sm text-slate-800 dark:text-slate-200">
          <input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={info.reminder} disabled={!canWrite} onChange={async (e) => { try { setInfo(await lifeApi.backupSettings(e.target.checked)); } catch (err) { addToast(formatApiError(err)); } }} />
          Remind me when my last backup is over 30 days old
        </label>
        {info.due && <p role="status" className="text-sm rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-100 p-3">{info.daysSince === null ? 'You have not made a backup yet.' : `Your last backup is ${info.daysSince} days old.`}</p>}
        <p className="text-xs text-slate-500 dark:text-slate-400">The file is not encrypted. Keep it somewhere private.</p>
      </Card>

      {canWrite && (
        <Card className="p-4 space-y-3">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"><Upload className="h-4 w-4" aria-hidden="true" />Restore from a file</h2>
          <p className="text-sm text-slate-700 dark:text-slate-300">Restoring only adds what is missing. Nothing is overwritten and nothing is deleted. You see a summary before anything changes.</p>
          <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={choose} />
          <Button variant="secondary" icon={Upload} loading={busy && !preview} onClick={() => input.current?.click()}>Choose a backup file</Button>

          {preview && file && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100"><ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />{file.name}, made {when(preview.createdAt)}</div>
              {counts(preview.counts).length === 0 ? <p className="text-sm text-slate-600 dark:text-slate-400">The file has nothing in it.</p> : (
                <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                  {counts(preview.counts).map((k) => {
                    const c = preview.counts[k];
                    const bits = [`${c.add} will be added`];
                    if (c.skip) bits.push(`${c.skip} already exist`);
                    if (c.overLimit) bits.push(`${c.overLimit} do not fit the limit`);
                    if (c.noPermission) bits.push(`${c.noPermission} not added because you cannot create tasks here`);
                    if (c.noArea) bits.push(`${c.noArea} belong to an area that is not there`);
                    if (c.rejected) bits.push(`${c.rejected} feed address(es) not allowed`);
                    return <li key={k}><b>{LABEL[k]}:</b> {bits.join(', ')}</li>;
                  })}
                </ul>
              )}
              <div className="flex gap-2">
                <Button loading={busy} onClick={restore}>Restore these</Button>
                <Button variant="secondary" onClick={() => { setPreview(null); setFile(null); }}>Cancel</Button>
              </div>
            </div>
          )}
          {done && (
            <div role="status" className="rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-100 p-3 text-sm">
              Restored: {counts(done).map((k) => `${done[k].add} ${LABEL[k].toLowerCase()}`).join(', ') || 'nothing new'}.
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
