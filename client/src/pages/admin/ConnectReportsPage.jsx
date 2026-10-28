import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Flag, Loader2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState } from '../../components/ui.jsx';
import { adminReportsApi } from '../../api/connect.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';

const REASON = { spam: 'Spam', harassment: 'Harassment', inappropriate: 'Inappropriate content', impersonation: 'Impersonation', other: 'Other' };
const TABS = [['open', 'Open'], ['reviewed', 'Reviewed'], ['dismissed', 'Dismissed']];

/** Platform administrators only: read Connect reports and mark them reviewed or dismissed. The server enforces the same rule. */
export default function ConnectReportsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [status, setStatus] = useState('open');
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState('');
  const load = useCallback(() => {
    setItems(null);
    adminReportsApi.list(status).then((r) => setItems(r.data.items)).catch((e) => { addToast(formatApiError(e), 'error'); setItems([]); });
  }, [status, addToast]);
  useEffect(() => { if (user?.role === 'platform-admin') load(); }, [load, user?.role]);
  if (user?.role !== 'platform-admin') return <Navigate to="/" replace />;

  const mark = async (id, next) => {
    setBusy(id);
    try { await adminReportsApi.setStatus(id, next); setItems((l) => l.filter((x) => x.id !== id)); addToast(next === 'reviewed' ? 'Marked as reviewed' : 'Dismissed'); } catch (e) { addToast(formatApiError(e), 'error'); } finally { setBusy(''); }
  };
  return (
    <div className="space-y-4 pb-8">
      <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Connect reports</h1><p className="text-sm text-slate-500">People reported by other users. Only platform administrators can see this page.</p></div>
      <div role="tablist" aria-label="Report status" className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={status === k} onClick={() => setStatus(k)} className={`min-h-[40px] rounded-lg px-4 text-sm font-semibold ${status === k ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-sky-400' : 'text-slate-500'}`}>{label}</button>)}
      </div>
      {items === null ? <p className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading…</p>
        : items.length === 0 ? <Card className="p-2"><EmptyState icon={Flag} title="Nothing here" description="No reports with this status." /></Card>
          : (
            <ul className="space-y-3">
              {items.map((r) => (
                <li key={r.id}>
                  <Card className="space-y-2 p-4">
                    <div className="flex flex-wrap items-center gap-2"><Badge>{REASON[r.reason] || r.reason}</Badge><span className="text-xs text-slate-500">{new Date(r.at).toLocaleString()}</span></div>
                    <p className="text-sm text-slate-800 dark:text-slate-200"><b>{r.reporter.name}</b> reported <b>{r.target.name}</b>{r.target.email ? <span className="text-slate-500"> ({r.target.email})</span> : null}</p>
                    {r.details && <p className="whitespace-pre-wrap break-words text-sm text-slate-600 dark:text-slate-300">“{r.details}”</p>}
                    {r.message && <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200"><span className="mb-1 block text-xs font-semibold uppercase text-slate-400">Reported message ({r.message.kind})</span>{r.message.text || '(no text)'}</p>}
                    {status === 'open' && <div className="flex gap-2 pt-1"><Button className="!bg-blue-600 hover:!bg-blue-700 !text-white" loading={busy === r.id} onClick={() => mark(r.id, 'reviewed')}>Mark reviewed</Button><Button variant="secondary" disabled={busy === r.id} onClick={() => mark(r.id, 'dismissed')}>Dismiss</Button></div>}
                  </Card>
                </li>
              ))}
            </ul>
          )}
    </div>
  );
}
