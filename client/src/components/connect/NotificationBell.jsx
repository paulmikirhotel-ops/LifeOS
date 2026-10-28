import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, UserPlus, UserCheck, Users, PhoneMissed, FileText, Sparkles, Check } from 'lucide-react';
import { Modal } from '../ui.jsx';
import { useConnect } from '../../context/ConnectContext.jsx';
import { listTime } from '../../utils/connectFormat.js';

const ICON = { friend_request: UserPlus, friend_accepted: UserCheck, group_added: Users, missed_call: PhoneMissed, shared_file: FileText, shared_item: Sparkles };

/** Bell in the Connect header: friend requests, group invitations, missed calls and things shared with you. */
export default function NotificationBell() {
  const { notes, noteActions } = useConnect();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const canAsk = typeof Notification !== 'undefined' && Notification.permission === 'default';
  const go = (n) => { noteActions.markOne(n.id); setOpen(false); navigate(n.link); };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={notes.unread ? `Notifications, ${notes.unread} unread` : 'Notifications'} className="relative ml-auto flex h-11 w-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:text-slate-300 dark:hover:bg-slate-800">
        <Bell className="h-5 w-5" aria-hidden="true" />
        {notes.unread > 0 && <span className="absolute right-1 top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-600 px-1 text-[11px] font-bold text-white">{notes.unread > 9 ? '9+' : notes.unread}</span>}
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Connect notifications">
        <div className="space-y-3">
          {notes.unread > 0 && <button type="button" onClick={noteActions.markAll} className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-sky-400"><Check className="h-4 w-4" aria-hidden="true" />Mark all as read</button>}
          {notes.items.length === 0
            ? <p className="py-8 text-center text-sm text-slate-500">You are all caught up.</p>
            : (
              <ul className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                {notes.items.map((n) => {
                  const Icon = ICON[n.type] || Bell;
                  return (
                    <li key={n.id}>
                      <button type="button" onClick={() => go(n)} className={`flex min-h-[60px] w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 ${n.read ? '' : 'bg-blue-50/60 dark:bg-blue-500/5'}`}>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-sky-400"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                        <span className="min-w-0 flex-1"><span className={`block text-sm ${n.read ? 'text-slate-700 dark:text-slate-300' : 'font-semibold text-slate-900 dark:text-white'}`}>{n.title}</span>{n.body && <span className="block truncate text-xs text-slate-500">{n.body}</span>}</span>
                        <span className="shrink-0 text-xs text-slate-400">{listTime(n.at)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          {canAsk && <button type="button" onClick={() => Notification.requestPermission().then(() => setOpen(false))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Also show alerts when LifeOS is in the background</button>}
        </div>
      </Modal>
    </>
  );
}
