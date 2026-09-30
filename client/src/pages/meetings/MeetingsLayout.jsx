import React from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui.jsx';
import { useTenant } from '../../context/TenantContext.jsx';

const TABS = [
  { to: '/meetings', label: 'Dashboard', end: true },
  { to: '/meetings/calendar', label: 'Calendar' },
  { to: '/meetings/history', label: 'History' },
  { to: '/meetings/action-items', label: 'Action Items' },
];

/** Meetings section shell: Dashboard, Calendar, History and Action Items. */
export default function MeetingsLayout() {
  const { can } = useTenant();
  return (
    <div className="space-y-5 pb-24 md:pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">Meetings</h1>
          <p className="text-sm text-slate-500">Schedule, record, transcribe and follow up.</p>
        </div>
        {can('meetings.create') && (
          <Link to="/meetings/new">
            <Button icon={Plus} className="min-h-[44px]">Schedule meeting</Button>
          </Link>
        )}
      </div>

      <nav aria-label="Meetings sections" className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800 -mx-1 px-1">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => `whitespace-nowrap px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${isActive ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
