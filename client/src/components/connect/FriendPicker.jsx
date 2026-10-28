import React from 'react';
import { Check } from 'lucide-react';
import Avatar from './Avatar.jsx';

/** Checklist (or single-pick list) of friends. */
export default function FriendPicker({ friends, selected = [], onToggle, single = false, empty = 'You have no friends to pick yet.' }) {
  if (!friends.length) return <p className="py-6 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
      {friends.map((f) => {
        const on = selected.includes(f.id);
        return (
          <li key={f.id}>
            <button type="button" onClick={() => onToggle(f.id)} role={single ? 'button' : 'checkbox'} aria-checked={single ? undefined : on}
              className="flex min-h-[56px] w-full items-center gap-3 px-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <Avatar name={f.name} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{f.name}</span>
              {!single && <span className={`flex h-6 w-6 items-center justify-center rounded-md border ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>{on && <Check className="h-4 w-4" />}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
