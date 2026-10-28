import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Flag, Loader2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState } from '../components/ui.jsx';
import { communityAdminApi } from '../api/community.js';
import ResourceReportsSection from '../components/community/ResourceReportsSection.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatApiError } from '../utils/errors.js';

const TABS = [['open', 'Open'], ['reviewed', 'Reviewed'], ['dismissed', 'Dismissed']];

function Listings() {
  const { addToast } = useToast();
  const [items, setItems] = useState(null);
  useEffect(() => { communityAdminApi.listings().then((r) => setItems(r.data.items)).catch(() => setItems([])); }, []);
  const toggle = async (l) => {
    try { await communityAdminApi.verify(l.id, !l.verified); setItems((all) => all.map((x) => (x.id === l.id ? { ...x, verified: !l.verified } : x))); addToast(l.verified ? 'Badge removed' : 'Marked as reviewed'); }
    catch (e) { addToast(formatApiError(e), 'error'); }
  };
  if (!items) return null;
  return (
    <section aria-label="Impact listings" className="space-y-2 pt-4">
      <h2 className="text-lg font-semibold">Impact listings</h2>
      <p className="text-sm text-slate-500">Only mark a listing "reviewed" after you have checked the organization yourself. The badge shows people a LifeOS admin looked at it; it is not a guarantee.</p>
      {items.length === 0 ? <p className="text-sm text-slate-500">No listings yet.</p> : (
        <ul className="space-y-2">{items.map((l) => (
          <li key={l.id}><Card className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="min-w-0"><p className="truncate text-sm font-medium">{l.title}</p><p className="text-xs text-slate-500">{l.category} · {l.orgName || 'no organization name'} · {l.status}</p></div>
            <Button size="sm" variant={l.verified ? 'secondary' : 'primary'} onClick={() => toggle(l)}>{l.verified ? 'Remove reviewed badge' : 'Mark as reviewed'}</Button>
          </Card></li>))}
        </ul>
      )}
    </section>
  );
}

/** Platform administrators only. "Dismiss" shows a hidden listing again if fewer than 3 open reports remain. */
export default function CommunityReportsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [status, setStatus] = useState('open');
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState('');
  const load = useCallback(() => {
    setItems(null);
    communityAdminApi.list(status).then((r) => setItems(r.data.items)).catch((e) => { addToast(formatApiError(e), 'error'); setItems([]); });
  }, [status, addToast]);
  useEffect(() => { if (user?.role === 'platform-admin') load(); }, [load, user?.role]);
  if (user?.role !== 'platform-admin') return <Navigate to="/" replace />;

  const mark = async (id, next) => {
    setBusy(id);
    try { await communityAdminApi.setStatus(id, next); setItems((l) => l.filter((x) => x.id !== id)); addToast(next === 'reviewed' ? 'Marked as reviewed (stays hidden if it was hidden)' : 'Dismissed'); }
    catch (e) { addToast(formatApiError(e), 'error'); } finally { setBusy(''); }
  };
  return (
    <div className="space-y-4 pb-8">
      <div><h1 className="text-2xl font-bold tracking-tight">Community reports</h1><p className="text-sm text-slate-500">Reports about community profiles and study groups. Platform administrators only.</p></div>
      <div role="tablist" aria-label="Report status" className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={status === k} onClick={() => setStatus(k)} className={`min-h-[40px] rounded-lg px-4 text-sm font-semibold ${status === k ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-900' : 'text-slate-500'}`}>{label}</button>)}
      </div>
      {items === null ? <p className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading…</p>
        : items.length === 0 ? <Card className="p-2"><EmptyState icon={Flag} title="Nothing here" description="No reports with this status." /></Card>
          : (
            <ul className="space-y-3">
              {items.map((r) => (
                <li key={r.id}><Card className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2"><Badge variant="warning">{r.reason}</Badge><Badge variant="info">{r.targetType}</Badge><span className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleString()}</span></div>
                  <p className="text-sm"><strong>{r.targetName}</strong> reported by {r.reporterName}</p>
                  <p className="rounded bg-slate-50 p-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">{r.snapshot}</p>
                  {r.details && <p className="text-sm text-slate-600">Reporter says: {r.details}</p>}
                  {status === 'open' && <div className="flex gap-2"><Button size="sm" loading={busy === r.id} onClick={() => mark(r.id, 'reviewed')}>Mark reviewed</Button><Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => mark(r.id, 'dismissed')}>Dismiss</Button></div>}
                </Card></li>
              ))}
            </ul>
          )}
      <Listings />
      <ResourceReportsSection />
    </div>
  );
}
