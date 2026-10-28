import React from 'react';
import { ListChecks, CalendarClock, TriangleAlert, CheckCheck } from 'lucide-react';

function Ring({ pct }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90" aria-hidden="true">
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className="stroke-slate-200 dark:stroke-slate-700" />
      <circle
        cx="20" cy="20" r={r} fill="none" strokeWidth="4" strokeLinecap="round"
        className="stroke-emerald-500 transition-[stroke-dashoffset] duration-700"
        strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100}
      />
    </svg>
  );
}

function Tile({ icon: Icon, label, value, hint, tone, onClick, children }) {
  const tones = {
    indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`group flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm dark:border-slate-800 dark:bg-slate-900 ${onClick ? 'transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500' : ''}`}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      </div>
      {children || (
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
    </Tag>
  );
}

/** Four at-a-glance tiles. The "Due today" and "Overdue" tiles jump straight to that tab. */
export default function TaskStats({ stats, onJump }) {
  return (
    <section aria-label="Task summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile icon={ListChecks} tone="indigo" label="Open" value={stats.open} hint={stats.open === 1 ? '1 task to finish' : 'tasks to finish'} />
      <Tile icon={CalendarClock} tone="amber" label="Due today" value={stats.dueToday} hint={stats.dueToday ? 'Focus on these first' : 'Nothing due today'} onClick={() => onJump('Today')} />
      <Tile icon={TriangleAlert} tone="rose" label="Overdue" value={stats.overdue} hint={stats.overdue ? 'Needs attention' : 'You are on track'} onClick={() => onJump('Overdue')} />
      <Tile icon={CheckCheck} tone="emerald" label="Done this week" value={stats.doneWeek} hint={`${stats.pct}% of all tasks done`}>
        <div className="relative flex shrink-0 items-center justify-center">
          <Ring pct={stats.pct} />
          <span className="absolute text-[10px] font-bold tabular-nums text-slate-700 dark:text-slate-200">{stats.pct}%</span>
        </div>
      </Tile>
    </section>
  );
}
