import React from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Users, UserPlus, Video, Bell, ArrowRight } from 'lucide-react';
import { Card, EmptyState } from '../../components/ui.jsx';
import ConversationRow from '../../components/connect/ConversationRow.jsx';
import FriendStories from '../../components/connect/FriendStories.jsx';
import Avatar from '../../components/connect/Avatar.jsx';
import { useConnect } from '../../context/ConnectContext.jsx';
import { conversationRow } from '../../utils/connectFormat.js';

function Tile({ icon: Icon, label, value, to, tone }) {
  return (
    <Link to={to} className="group focus-visible:outline-none">
      <Card interactive className="relative overflow-hidden rounded-2xl p-4 group-focus-visible:ring-2 group-focus-visible:ring-blue-500/60">
        <span className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-md ${tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
        <span className="mt-3 block text-3xl font-extrabold leading-none tabular-nums text-slate-900 dark:text-white">{value}</span>
        <span className="mt-1 flex items-center justify-between text-sm text-slate-500">{label}<ArrowRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
      </Card>
    </Link>
  );
}

function Section({ title, to, children }) {
  return (
    <Card className="overflow-hidden rounded-2xl p-2">
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
        {to && <Link to={to} className="rounded-lg px-2 py-1 text-sm font-semibold text-blue-600 hover:bg-blue-50 dark:text-sky-400 dark:hover:bg-sky-500/10">See all</Link>}
      </div>
      {children}
    </Card>
  );
}

/** Overview: friends row, real counts, latest conversations and pending friend requests. */
export default function ConnectHomePage() {
  const { summary, conversations, friends } = useConnect();
  const stats = summary;
  const recent = conversations.slice(0, 5).map((c) => conversationRow(c));
  return (
    <div className="space-y-5">
      <Card className="rounded-2xl px-4 py-4">
        <FriendStories />
      </Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={MessageCircle} label="Unread" value={stats.unread} to="/connect/chats" tone="from-blue-500 to-blue-700" />
        <Tile icon={UserPlus} label="Friends" value={stats.friends} to="/connect/friends" tone="from-sky-400 to-sky-600" />
        <Tile icon={Users} label="Groups" value={stats.groups} to="/connect/groups" tone="from-indigo-500 to-violet-600" />
        <Tile icon={Video} label="Live meetings" value={stats.meetings} to="/meetings" tone="from-cyan-400 to-teal-500" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title="Recent conversations" to={recent.length ? '/connect/chats' : undefined}>
          {recent.length === 0
            ? <EmptyState icon={MessageCircle} title="No conversations yet" description="When you chat with friends, your latest conversations show up here." />
            : <div className="space-y-0.5 p-2">{recent.map((c) => <ConversationRow key={c.id} c={c} to={`/connect/chats/${c.id}`} />)}</div>}
        </Section>
        <Section title="Activity">
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
        </Section>
      </div>
    </div>
  );
}
