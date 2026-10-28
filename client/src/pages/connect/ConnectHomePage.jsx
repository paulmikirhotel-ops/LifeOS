import React from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Users, UserPlus, Video, Bell, ArrowRight } from 'lucide-react';
import { Card, EmptyState } from '../../components/ui.jsx';
import ConversationRow from '../../components/connect/ConversationRow.jsx';
import Avatar from '../../components/connect/Avatar.jsx';
import { useConnect } from '../../context/ConnectContext.jsx';
import { conversationRow } from '../../utils/connectFormat.js';

function Tile({ icon: Icon, label, value, to, tone }) {
  return (
    <Link to={to} className="group focus-visible:outline-none">
      <Card interactive className="flex items-center gap-4 p-4 group-focus-visible:ring-2 group-focus-visible:ring-blue-500/60">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone}`}><Icon className="h-6 w-6" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-2xl font-bold leading-none text-slate-900 dark:text-white">{value}</span>
          <span className="mt-1 block text-sm text-slate-500">{label}</span>
        </span>
        <ArrowRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Card>
    </Link>
  );
}

/** Overview: real counts, latest conversations and pending friend requests. */
export default function ConnectHomePage() {
  const { summary, conversations, friends } = useConnect();
  const stats = summary;
  const recent = conversations.slice(0, 5).map((c) => conversationRow(c));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon={MessageCircle} label="Unread messages" value={stats.unread} to="/connect/chats" tone="bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-sky-400" />
        <Tile icon={UserPlus} label="Friends" value={stats.friends} to="/connect/friends" tone="bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400" />
        <Tile icon={Users} label="Groups" value={stats.groups} to="/connect/groups" tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300" />
        <Tile icon={Video} label="Active meetings" value={stats.meetings} to="/meetings" tone="bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-300" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="p-2">
          <h2 className="px-4 pt-3 font-bold text-slate-900 dark:text-white">Recent conversations</h2>
          {recent.length === 0
            ? <EmptyState icon={MessageCircle} title="No conversations yet" description="When you chat with friends, your latest conversations show up here." />
            : <div className="space-y-0.5 p-2">{recent.map((c) => <ConversationRow key={c.id} c={c} to={`/connect/chats/${c.id}`} />)}</div>}
        </Card>
        <Card className="p-2">
          <h2 className="px-4 pt-3 font-bold text-slate-900 dark:text-white">Activity</h2>
          {friends.incoming.length === 0
            ? <EmptyState icon={Bell} title="Nothing new" description="Friend requests, group invitations and shared items will appear here." />
            : (
              <ul className="space-y-0.5 p-2">
                {friends.incoming.map((p) => (
                  <li key={p.requestId}>
                    <Link to="/connect/friends" className="flex min-h-[56px] items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <Avatar name={p.name} />
                      <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-slate-900 dark:text-white">{p.name}</span><span className="text-sm text-slate-500">wants to be your friend</span></span>
                      <ArrowRight className="h-4 w-4 text-slate-300" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </Card>
      </div>
    </div>
  );
}
