import React from 'react';
import { NavLink } from 'react-router-dom';
import { BellOff } from 'lucide-react';
import Avatar from './Avatar.jsx';
import StatusTicks from './StatusTicks.jsx';

/** One line in the conversation list: avatar, name, last message, time, unread badge. */
export default function ConversationRow({ c, to, active }) {
  const body = (
    <>
      <Avatar name={c.name} src={c.avatar} online={c.group ? undefined : c.online} group={c.group} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-semibold text-slate-900 dark:text-white">{c.name}</span>
          <span className={`shrink-0 text-xs ${c.unread ? 'font-semibold text-blue-600 dark:text-sky-400' : 'text-slate-400'}`}>{c.time}</span>
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1 text-sm text-slate-500">
            {c.mine && c.status && <StatusTicks status={c.status} />}
            <span className="truncate">{c.typing ? <em className="text-blue-600 dark:text-sky-400 not-italic font-medium">typing…</em> : c.last}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {c.muted && <BellOff className="h-3.5 w-3.5 text-slate-400" aria-label="Muted" />}
            {c.unread > 0 && <span className="min-w-[1.25rem] rounded-full bg-blue-600 px-1.5 py-0.5 text-center text-[11px] font-bold leading-none text-white" aria-label={`${c.unread} unread`}>{c.unread > 99 ? '99+' : c.unread}</span>}
          </span>
        </span>
      </span>
    </>
  );
  const cls = (on) => `flex min-h-[64px] items-center gap-3 rounded-xl px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${on ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`;
  return to
    ? <NavLink to={to} className={({ isActive }) => cls(isActive)}>{body}</NavLink>
    : <div className={cls(active)}>{body}</div>;
}
