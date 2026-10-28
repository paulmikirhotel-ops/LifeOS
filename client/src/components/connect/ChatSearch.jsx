import React, { useEffect, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { connectApi } from '../../api/connect.js';
import { listTime } from '../../utils/connectFormat.js';

/** Search inside one chat. Tapping a result jumps to that message. */
export default function ChatSearch({ conversationId, nameOf, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setItems(null); return undefined; }
    let alive = true;
    setBusy(true);
    const t = setTimeout(() => {
      connectApi.searchMessages(conversationId, term).then((r) => alive && setItems(r.data.items)).catch(() => alive && setItems([])).finally(() => alive && setBusy(false));
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [q, conversationId]);
  return (
    <div className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <label htmlFor="chat-search" className="sr-only">Search in this chat</label>
          <input id="chat-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search in this chat" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-9 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
          {busy && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" aria-hidden="true" />}
        </div>
        <button type="button" onClick={onClose} aria-label="Close search" className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
      </div>
      {items && (
        <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {items.length === 0 ? <li className="px-4 py-4 text-center text-sm text-slate-500">No messages found.</li> : items.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onPick(m)} className="block w-full px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <span className="flex items-baseline justify-between gap-2 text-xs text-slate-500"><span className="truncate font-semibold">{nameOf(m.senderId) || 'You'}</span><span>{listTime(m.at)}</span></span>
                <span className="block truncate text-sm text-slate-800 dark:text-slate-200">{m.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
