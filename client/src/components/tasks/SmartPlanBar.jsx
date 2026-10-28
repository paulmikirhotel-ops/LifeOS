import React, { useState } from 'react';
import { Sparkles, ArrowRight, Clock } from 'lucide-react';
import api from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { clock12 } from '../../utils/tasks.js';

const EXAMPLES = ['Study JavaScript for 2 hours tomorrow', 'Review pull requests for 45 min', 'Plan the week for 30 minutes'];

/** Same parsing as before: "… for 2 hours", "… for 45 min", "tomorrow". */
function parsePlan(text) {
  const durationMatch = text.match(/for\s+(\d+)\s*(hours?|hrs?|h|minutes?|mins?|min)\b/i);
  let durationMin = 60;
  if (durationMatch) {
    const val = parseInt(durationMatch[1], 10);
    durationMin = durationMatch[2].toLowerCase().startsWith('h') ? val * 60 : val;
  }
  durationMin = Math.max(15, Math.min(480, durationMin));
  const title = text.replace(/for\s+\d+\s*(hours?|hrs?|h|minutes?|mins?|min)\b.*$/i, '').trim() || text;
  const date = /tomorrow/i.test(text)
    ? new Date(Date.now() + 86400000).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];
  return { title, durationMin, date };
}

export default function SmartPlanBar({ onPlanned, disabled }) {
  const { addToast } = useToast();
  const [value, setValue] = useState('');
  const [planning, setPlanning] = useState(false);
  const [slot, setSlot] = useState(null);

  const run = async () => {
    const text = value.trim();
    if (!text || planning) return;
    setPlanning(true);
    setSlot(null);
    try {
      const res = await api.post('/tasks/plan', parsePlan(text));
      if (res.success) {
        const suggestion = res.data?.suggestion;
        setSlot(suggestion ? `${clock12(suggestion.startMin)} – ${clock12(suggestion.endMin)}` : 'none');
        addToast(suggestion ? 'Task created — suggested time slot found in your schedule' : 'Task created — no free slot found for that day');
        setValue('');
        onPlanned?.();
      }
    } catch {
      addToast('Could not plan that. Try "Study JavaScript for 2 hours tomorrow"', 'error');
    } finally {
      setPlanning(false);
    }
  };

  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 p-4 shadow-lg shadow-indigo-500/20 sm:p-5">
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
      <div className="relative">
        <div className="mb-3 flex items-center gap-2 text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 backdrop-blur">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold leading-tight">Smart Plan</h2>
            <p className="text-xs text-indigo-100">Describe it naturally — we'll create the task and find a free slot.</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            disabled={disabled}
            aria-label="Describe a task to plan"
            placeholder='Try "Study JavaScript for 2 hours tomorrow"'
            className="min-w-0 flex-1 rounded-xl border-0 bg-white/95 px-4 py-2.5 text-sm text-slate-900 shadow-inner placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-white/70"
          />
          <button
            type="button"
            onClick={run}
            disabled={planning || !value.trim() || disabled}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-indigo-700 shadow-sm transition-all hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-white/70 disabled:opacity-60"
          >
            {planning ? 'Planning…' : 'Plan it'}
            {!planning && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>

        <div className={`mt-3 flex-wrap items-center gap-2 ${slot ? 'flex' : 'hidden sm:flex'}`}>
          {slot ? (
            <span className="task-fade inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white">
              <Clock className="h-3 w-3" />
              {slot === 'none' ? 'No free slot that day' : `Suggested slot ${slot}`}
            </span>
          ) : (
            EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setValue(ex)}
                className="rounded-full bg-white/10 px-3 py-1 text-xs text-indigo-50 transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/60"
              >
                {ex}
              </button>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
