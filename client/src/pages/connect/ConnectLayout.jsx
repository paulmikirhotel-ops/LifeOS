import React from 'react';
import { NavLink, Outlet, useMatch } from 'react-router-dom';
import NotificationBell from '../../components/connect/NotificationBell.jsx';
import { LayoutGrid, MessageCircle, Users, UserPlus, FolderOpen, PhoneCall } from 'lucide-react';

const TABS = [
  { to: '/connect', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/connect/chats', label: 'Chats', icon: MessageCircle },
  { to: '/connect/groups', label: 'Groups', icon: Users },
  { to: '/connect/friends', label: 'Friends', icon: UserPlus },
  { to: '/connect/files', label: 'Files', icon: FolderOpen },
  { to: '/connect/calls', label: 'Calls', icon: PhoneCall },
];

/** LifeOS Connect shell. On a phone, an open conversation hides the heading and tabs so the chat gets the whole screen. */
export default function ConnectLayout() {
  const inThread = Boolean(useMatch('/connect/chats/:id'));
  return (
    <div className="space-y-4 pb-8">
      <div className={inThread ? 'hidden md:block' : ''}>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-md"><MessageCircle className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">Connect</h1>
            <p className="text-sm text-slate-500">Chat, share and work together with the people around you.</p>
          </div>
          <NotificationBell />
        </div>
        <nav aria-label="Connect sections" className="-mx-1 mt-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-1 dark:border-slate-800">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `-mb-px inline-flex items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/60 ${isActive ? 'border-blue-600 text-blue-600 dark:border-sky-400 dark:text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
              <Icon className="h-4 w-4" aria-hidden="true" />{label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
