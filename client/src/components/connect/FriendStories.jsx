import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { useConnect } from '../../context/ConnectContext.jsx';

/** Facebook-style row of friends: tap one to open the chat. Friends who are online come first and get a green ring. */
export default function FriendStories({ limit = 12 }) {
  const { friends, openWith } = useConnect();
  const navigate = useNavigate();
  const [busy, setBusy] = useState('');
  const people = useMemo(() => [...(friends.friends || [])].sort((a, b) => Number(Boolean(b.online)) - Number(Boolean(a.online))).slice(0, limit), [friends.friends, limit]);

  const open = async (p) => {
    if (busy) return;
    setBusy(p.id);
    try {
      const conv = await openWith(p.id);
      navigate(`/connect/chats/${conv.id}`);
    } catch {
      navigate('/connect/friends');
    } finally {
      setBusy('');
    }
  };

  return (
    <ul aria-label="Friends" className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <li className="w-[4.5rem] shrink-0 snap-start">
        <Link to="/connect/friends" className="flex flex-col items-center gap-1.5 focus-visible:outline-none">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-blue-300 bg-blue-50 text-blue-600 transition-colors hover:bg-blue-100 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300"><Plus className="h-6 w-6" aria-hidden="true" /></span>
          <span className="w-full truncate text-center text-xs font-medium text-slate-600 dark:text-slate-300">Add friend</span>
        </Link>
      </li>
      {people.map((p) => (
        <li key={p.id} className="w-[4.5rem] shrink-0 snap-start">
          <button type="button" onClick={() => open(p)} disabled={busy === p.id} aria-label={`Message ${p.name}${p.online ? ', online' : ''}`} className="flex w-full flex-col items-center gap-1.5 focus-visible:outline-none disabled:opacity-60">
            <span className={`rounded-full p-[3px] ${p.online ? 'bg-gradient-to-tr from-emerald-400 to-sky-500' : 'bg-slate-200 dark:bg-slate-700'}`}>
              <span className="block rounded-full bg-white p-[2px] dark:bg-slate-900"><Avatar name={p.name} src={p.avatar} size="lg" /></span>
            </span>
            <span className="w-full truncate text-center text-xs font-medium text-slate-700 dark:text-slate-200">{String(p.name || '').split(' ')[0]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
