import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useMatch } from 'react-router-dom';
import NotificationBell from '../../components/connect/NotificationBell.jsx';
import { LayoutGrid, MessageCircle, Users, UserPlus, FolderOpen, PhoneCall } from 'lucide-react';
import { canUse3D } from '../../utils/webgl.js';

// three.js is only downloaded when the Overview page opens on a device that can show it.
const ConnectOrbs = lazy(() => import('../../components/connect/ConnectOrbs.jsx'));

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
  const onHome = Boolean(useMatch({ path: '/connect', end: true }));
  const { pathname } = useLocation();
  const nav = useRef(null);
  const [with3d] = useState(() => canUse3D());

  // Keep the open section visible in the sideways-scrolling tab row.
  useEffect(() => {
    const row = nav.current;
    const on = row?.querySelector('[aria-current="page"]');
    if (!row || !on) return;
    row.scrollTo?.({ left: on.offsetLeft - (row.clientWidth - on.clientWidth) / 2, behavior: 'smooth' });
  }, [pathname]);

  return (
    <div className="space-y-4 pb-8">
      <div className={inThread ? 'hidden md:block' : ''}>
        <header className={`relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-600 to-sky-500 text-white shadow-lg shadow-blue-600/20 ${onHome ? 'px-5 py-7 sm:px-8 sm:py-9' : 'px-4 py-3.5 sm:px-6'}`}>
          <span aria-hidden="true" className="absolute -right-10 -top-12 -z-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
          <span aria-hidden="true" className="absolute -bottom-16 left-1/3 -z-10 h-40 w-40 rounded-full bg-sky-300/20 blur-2xl" />
          {onHome && with3d && <Suspense fallback={null}><ConnectOrbs className="-z-10" /></Suspense>}
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 shadow-inner ring-1 ring-white/30 backdrop-blur"><MessageCircle className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Connect</h1>
              {onHome && <p className="text-sm text-white/85">Chat, share and work together with the people around you.</p>}
            </div>
            <span className="ml-auto shrink-0 rounded-full bg-white shadow-md"><NotificationBell /></span>
          </div>
        </header>
        <nav ref={nav} aria-label="Connect sections" className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${isActive ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800 dark:hover:bg-slate-800'}`}>
              <Icon className="h-4 w-4" aria-hidden="true" />{label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
