import React, { useCallback, useEffect, useState } from 'react';
import { extrasAdminApi } from '../../api/communityExtras.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';
import { Badge, Button, Card } from '../ui.jsx';

/** Platform administrators only (shown inside the Community reports page). */
export default function ResourceReportsSection() {
  const { addToast } = useToast();
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState('');
  const load = useCallback(() => { extrasAdminApi.reports('open').then((r) => setItems(Array.isArray(r?.data?.items) ? r.data.items : [])).catch((e) => { addToast(formatApiError(e), 'error'); setItems([]); }); }, [addToast]);
  useEffect(() => { load(); }, [load]);
  const run = async (id, fn, ok) => { setBusy(id); try { await fn(); addToast(ok); load(); } catch (e) { addToast(formatApiError(e), 'error'); } finally { setBusy(''); } };
  if (!items) return null;
  return (
    <section aria-label="Learning resource reports" className="space-y-2 pt-4">
      <h2 className="text-lg font-semibold">Learning resource reports (open)</h2>
      <p className="text-sm text-slate-500">Three different people reporting a resource hides it. "Dismiss" shows it again if fewer than 3 open reports remain. Links are shown as plain text on purpose: do not open one unless you decide to.</p>
      {items.length === 0 ? <p className="text-sm text-slate-500">No open reports.</p> : (
        <ul className="space-y-3">{items.map((r) => (
          <li key={r.id}><Card className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2"><Badge variant="warning">{r.reason}</Badge><Badge variant="info">{r.resourceStatus}</Badge><span className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleString()}</span></div>
            <p className="text-sm"><strong>{r.ownerName}</strong> reported by {r.reporterName}</p>
            <p className="break-all rounded bg-slate-50 p-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">{r.snapshot}</p>
            {r.details && <p className="text-sm text-slate-600">Reporter says: {r.details}</p>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" loading={busy === r.id} onClick={() => run(r.id, () => extrasAdminApi.setReport(r.id, 'reviewed'), 'Marked reviewed')}>Mark reviewed</Button>
              <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => run(r.id, () => extrasAdminApi.setReport(r.id, 'dismissed'), 'Dismissed')}>Dismiss</Button>
              {r.resourceStatus !== 'removed' && <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => window.confirm('Remove this resource for good?') && run(r.id, () => extrasAdminApi.removeResource(r.resourceId), 'Resource removed')}>Remove resource</Button>}
            </div>
          </Card></li>))}
        </ul>
      )}
    </section>
  );
}
