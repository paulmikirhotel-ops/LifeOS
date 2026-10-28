import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Check, Clock, ArrowRight } from 'lucide-react';
import { nextstepApi } from '../../api/nextstep.js';
import { useTenant } from '../../context/TenantContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';

const when = (d) => {
  if (!d) return '';
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
};

/**
 * "Your next step" card. It only reads what the user already approved in NextStep (no AI call).
 * It renders nothing when there is nothing scheduled, so it is safe to drop on any page.
 */
export default function NextStepCard({ className = '' }) {
  const { can } = useTenant();
  const { addToast } = useToast();
  const [next, setNext] = useState(null);
  const [busy, setBusy] = useState(false);
  const allowed = can('goals.view');

  const load = useCallback(async () => {
    try {
      const res = await nextstepApi.next();
      setNext(res.success ? res.data : null);
    } catch {
      setNext(null); // a missing card must never break the page it sits on
    }
  }, []);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  if (!allowed || !next) return null;

  const act = async (action) => {
    setBusy(true);
    try {
      await nextstepApi.mark(next.planId, next.itemId, action);
      addToast(action === 'done' ? 'Nice. Step completed.' : 'Moved to tomorrow.');
      await load();
    } catch (err) {
      addToast(formatApiError(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Your next step"
      className={`rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 text-white p-5 shadow-sm ${className}`}
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-100">
        <Compass className="w-4 h-4" aria-hidden="true" /> Your next step
      </div>
      <h2 className="mt-2 text-lg font-bold leading-snug">{next.title}</h2>
      <p className="mt-1 text-sm text-indigo-100">
        {next.planTitle} · {next.estimatedMinutes} min · {when(next.dueDate)}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => act('done')}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-lg bg-white text-indigo-700 text-sm font-semibold disabled:opacity-60"
        >
          <Check className="w-4 h-4" aria-hidden="true" /> Done
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => act('later')}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-lg border border-white/50 text-sm font-medium disabled:opacity-60"
        >
          <Clock className="w-4 h-4" aria-hidden="true" /> Not today
        </button>
        <Link
          to="/nextstep"
          className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg text-sm font-medium text-indigo-100 hover:text-white"
        >
          Open roadmap <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
