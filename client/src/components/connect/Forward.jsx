import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Button, Modal } from '../ui.jsx';
import Avatar from './Avatar.jsx';

/** Pick up to five chats to send a copy of a message to. */
export default function ForwardModal({ message, conversations = [], onClose, onSend }) {
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPicked([]); }, [message]);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 5 ? p : [...p, id]));
  const send = async () => { setBusy(true); try { await onSend(picked); onClose(); } finally { setBusy(false); } };
  return (
    <Modal isOpen={Boolean(message)} onClose={() => !busy && onClose()} title="Forward to…">
      <div className="space-y-3">
        {conversations.length === 0
          ? <p className="py-6 text-center text-sm text-slate-500">You have no other chats yet.</p>
          : (
            <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => toggle(c.id)} aria-pressed={picked.includes(c.id)} className={`flex min-h-[56px] w-full items-center gap-3 px-3 text-left ${picked.includes(c.id) ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>
                    <Avatar name={c.name} group={c.group} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{c.name}</span>
                    {picked.includes(c.id) && <Check className="h-5 w-5 text-blue-600" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        <p className="text-xs text-slate-500">Up to 5 chats. Files are copied, so they stay even if the original is deleted.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button className="!bg-blue-600 hover:!bg-blue-700 !text-white" loading={busy} disabled={!picked.length} onClick={send}>Send{picked.length ? ` (${picked.length})` : ''}</Button>
        </div>
      </div>
    </Modal>
  );
}
