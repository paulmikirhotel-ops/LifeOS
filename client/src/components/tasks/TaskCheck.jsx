import React from 'react';
import { Check } from 'lucide-react';

export default function TaskCheck({ done, disabled, onToggle, title }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      disabled={disabled}
      aria-pressed={done}
      aria-label={done ? `Reopen "${title}"` : `Mark "${title}" as done`}
      className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed ${
        done
          ? 'border-emerald-500 bg-emerald-500 text-white'
          : 'border-slate-300 bg-white hover:border-emerald-400 hover:bg-emerald-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:border-emerald-500 dark:hover:bg-emerald-500/10'
      }`}
    >
      {done && <Check className="task-check-pop h-3.5 w-3.5" strokeWidth={3} />}
    </button>
  );
}
