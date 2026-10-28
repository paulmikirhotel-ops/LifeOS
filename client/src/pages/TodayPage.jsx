import React, { useState } from 'react';
import {
  Sun, Moon, CalendarRange, Check, CheckCircle2, Clock, Flame, Target, Wallet, Video, Sparkles,
  ChevronLeft, ChevronRight, ArrowRight, Calendar as CalendarIcon, Circle, Mail,
} from 'lucide-react';
import { addDays, format, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import api from '../api/client.js';
import { formatApiError } from '../utils/errors.js';
import { useToast } from '../context/ToastContext.jsx';
import {
  Button, Card, Badge, Textarea, EmptyState, ErrorState, SkeletonCard, PageHeader, StatCard, ProgressBar, AnimatedNumber,
} from '../components/ui.jsx';
import { formatTime, formatCurrency, todayStr } from '../utils/format.js';

const TABS = [
  { id: 'morning', label: 'Morning', icon: Sun },
  { id: 'evening', label: 'Evening', icon: Moon },
  { id: 'week', label: 'Week', icon: CalendarRange },
];

const URGENCY = {
  overdue: { label: 'Overdue', variant: 'error' },
  today: { label: 'Today', variant: 'warning' },
  later: { label: 'Soon', variant: 'neutral' },
  none: { label: 'No date', variant: 'neutral' },
};

function TabSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[0, 1, 2, 3].map((i) => <StatCard key={i} loading />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><SkeletonCard lines={4} /><SkeletonCard lines={4} /></div>
    </div>
  );
}

function SectionCard({ title, icon: Icon, action, children, className = '' }) {
  return (
    <Card className={`p-5 sm:p-6 ${className}`}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 min-w-0">
          {Icon && <Icon className="w-4 h-4 text-indigo-500 shrink-0" aria-hidden="true" />}
          <span className="truncate">{title}</span>
        </h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

/** The AI sentence, or an opt-in prompt. Never shown when the server has no AI provider. */
function InsightCard({ ai, onChange }) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);
  if (!ai || (!ai.available && !ai.text)) return null;

  const turnOn = async () => {
    setBusy(true);
    try {
      await api.patch('/briefing/preferences', { aiInsights: true });
      addToast('AI summary turned on');
      onChange();
    } catch (e) {
      addToast(formatApiError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (ai.text) {
    return (
      <Card className="p-5 sm:p-6 border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-500/10">
        <p className="flex items-start gap-3 text-sm sm:text-base text-slate-800 dark:text-slate-100">
          <Sparkles className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{ai.text}</span>
        </p>
      </Card>
    );
  }
  if (!ai.enabled) {
    return (
      <Card className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Sparkles className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 dark:text-white">Add a one-line plan written by AI</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Turning this on sends a short summary of your day (counts and up to three task titles) to the AI provider. Your journal, receipts and recordings are never sent. You can turn it off in Settings.
            </p>
          </div>
        </div>
        <Button onClick={turnOn} loading={busy} className="sm:ml-auto shrink-0">Turn on</Button>
      </Card>
    );
  }
  return null;
}

/* ───────────────────────────────── Morning ───────────────────────────────── */

function MorningTab() {
  const { addToast } = useToast();
  const { data, loading, error, reload } = useApi('/briefing/morning');
  const [pending, setPending] = useState(null);

  if (loading && !data) return <TabSkeleton />;
  if (error && !data) return <Card><ErrorState title="Your briefing couldn't load" details={error} onRetry={reload} /></Card>;
  const d = data || {};

  const completeTask = async (id) => {
    setPending(id);
    try {
      await api.patch(`/tasks/${id}`, { status: 'completed' });
      addToast('Task completed');
      reload();
    } catch (e) {
      addToast(formatApiError(e), 'error');
    } finally {
      setPending(null);
    }
  };

  const checkHabit = async (id) => {
    setPending(id);
    try {
      await api.post(`/habits/${id}/log`, { date: todayStr() });
      reload();
    } catch (e) {
      addToast(formatApiError(e), 'error');
    } finally {
      setPending(null);
    }
  };

  const priorities = d.tasks?.priorities || [];
  const habitsLeft = d.habits ? d.habits.total - d.habits.done : 0;
  const agenda = [
    ...(d.meetings || []).map((m) => ({ key: `m${m._id}`, at: m.startAt, title: m.title, kind: 'Meeting', link: `/meetings/${m._id}` })),
    ...(d.events || []).map((e) => ({ key: `e${e._id}`, at: e.startAt, title: e.title, kind: e.allDay ? 'All day' : 'Event' })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  return (
    <div className="space-y-6 sm:space-y-8">
      <InsightCard ai={d.ai} onChange={reload} />

      <section aria-label="Today at a glance" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {d.tasks && <StatCard title="Overdue" value={d.tasks.overdue} animate icon={Clock} color="rose" />}
        {d.tasks && <StatCard title="Due today" value={d.tasks.dueToday} animate icon={CheckCircle2} color="indigo" />}
        <StatCard title="Meetings" value={(d.meetings || []).length} animate icon={Video} color="amber" />
        {d.habits && <StatCard title="Habits left" value={habitsLeft} animate icon={Flame} color="emerald" />}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
        {d.tasks && (
          <SectionCard title="Your top priorities" icon={Target} action={<Link to="/tasks" className="inline-flex items-center min-h-[36px] shrink-0 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">All tasks</Link>}>
            {priorities.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Nothing urgent" description="No open tasks need attention today. Add one or enjoy the space." />
            ) : (
              <ol className="space-y-2">
                {priorities.map((t, i) => (
                  <li key={t._id} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                    <button
                      type="button"
                      onClick={() => completeTask(t._id)}
                      disabled={pending === t._id}
                      aria-label={`Mark "${t.title}" complete`}
                      className="min-h-[44px] min-w-[44px] -m-1 flex items-center justify-center rounded-full text-slate-400 hover:text-emerald-600 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-50"
                    >
                      <Circle className="w-6 h-6" aria-hidden="true" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 dark:text-white truncate"><span className="sr-only">Priority {i + 1}: </span>{t.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{t.priority}{t.dueDate ? ` · ${format(parseISO(t.dueDate), 'MMM d')}` : ''}</p>
                    </div>
                    <Badge variant={(URGENCY[t.urgency] || URGENCY.none).variant}>{(URGENCY[t.urgency] || URGENCY.none).label}</Badge>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        )}

        <SectionCard title="Today's schedule" icon={CalendarIcon} action={<Link to="/calendar" className="inline-flex items-center min-h-[36px] shrink-0 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">Calendar</Link>}>
          {agenda.length === 0 && (d.blocks || []).length === 0 ? (
            <EmptyState icon={CalendarIcon} title="A clear day" description="No meetings or events today." />
          ) : (
            <ul className="space-y-2">
              {agenda.map((a) => (
                <li key={a.key} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                  <span className="w-[4.75rem] shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatTime(a.at)}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-900 dark:text-white">
                    {a.link ? <Link to={a.link} className="inline-flex items-center min-h-[32px] hover:underline">{a.title}</Link> : a.title}
                  </span>
                  <Badge variant={a.kind === 'Meeting' ? 'brand' : 'neutral'}>{a.kind}</Badge>
                </li>
              ))}
              {(d.blocks || []).map((b) => (
                <li key={b._id} className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-3">
                  <span className="w-[4.75rem] shrink-0 whitespace-nowrap text-sm tabular-nums text-slate-500 dark:text-slate-400">{b.start}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-300">{b.title}</span>
                  <Badge variant="neutral">Planned</Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {d.habits && (
          <SectionCard title="Habits to do" icon={Flame} action={<Link to="/habits" className="inline-flex items-center min-h-[36px] shrink-0 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">All habits</Link>}>
            {d.habits.total === 0 ? (
              <EmptyState icon={Flame} title="No habits yet" description="Add a daily habit to start a streak." />
            ) : d.habits.todo.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="All habits done" description="Nice work. Every habit is checked off today." />
            ) : (
              <ul className="space-y-2">
                {d.habits.todo.map((h) => (
                  <li key={h._id} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-900 dark:text-white">{h.name}</span>
                    <Button size="sm" variant="secondary" icon={Check} loading={pending === h._id} onClick={() => checkHabit(h._id)} aria-label={`Check in: ${h.name}`}>Done</Button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        )}

        {(d.goalsIdle || []).length > 0 && (
          <SectionCard title="Goals gone quiet" icon={Target} action={<Link to="/goals" className="inline-flex items-center min-h-[36px] shrink-0 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">Open goals</Link>}>
            <ul className="space-y-3">
              {d.goalsIdle.map((g) => (
                <li key={g._id} className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-900 dark:text-white truncate">{g.title}</span>
                  <Badge variant="warning">{g.idleDays}d quiet</Badge>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">Pick one small next step for each, or close the goal if it no longer matters.</p>
          </SectionCard>
        )}

        {(d.goalsAtRisk || []).length > 0 && (
          <SectionCard title="Goals near their deadline" icon={Target} action={<Link to="/goals" className="inline-flex items-center min-h-[36px] shrink-0 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">All goals</Link>}>
            <ul className="space-y-4">
              {d.goalsAtRisk.map((g) => (
                <li key={g._id}>
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <span className="font-medium text-slate-900 dark:text-white truncate">{g.title}</span>
                    <Badge variant={g.daysLeft < 0 ? 'error' : 'warning'}>{g.daysLeft < 0 ? `${Math.abs(g.daysLeft)}d late` : `${g.daysLeft}d left`}</Badge>
                  </div>
                  <ProgressBar value={g.progress} color={g.daysLeft < 0 ? 'rose' : 'amber'} label={`${g.title} progress`} />
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>

      {d.money && (
        <Card className="p-5 sm:p-6 flex items-center gap-3">
          <Wallet className="w-5 h-5 text-emerald-500 shrink-0" aria-hidden="true" />
          <p className="text-sm sm:text-base text-slate-700 dark:text-slate-200">
            You have spent <strong className="text-slate-900 dark:text-white">{formatCurrency(d.money.monthSpend, d.currency)}</strong> so far this month.
          </p>
        </Card>
      )}
    </div>
  );
}

/* ───────────────────────────────── Evening ───────────────────────────────── */

function EveningTab() {
  const { addToast } = useToast();
  const { data, loading, error, reload } = useApi('/briefing/evening');
  const [wentWell, setWentWell] = useState(null);
  const [improve, setImprove] = useState(null);
  const [actions, setActions] = useState({});
  const [saving, setSaving] = useState(false);

  if (loading && !data) return <TabSkeleton />;
  if (error && !data) return <Card><ErrorState title="Your review couldn't load" details={error} onRetry={reload} /></Card>;
  const d = data || {};
  const went = wentWell ?? d.review?.wentWell ?? '';
  const imp = improve ?? d.review?.improve ?? '';
  const open = d.tasks?.open || [];

  const setAction = (id, action) => setActions((a) => ({ ...a, [id]: a[id] === action ? undefined : action }));

  const save = async () => {
    setSaving(true);
    try {
      const taskActions = Object.entries(actions).filter(([, v]) => v).map(([taskId, action]) => ({ taskId, action }));
      const res = await api.post('/briefing/evening/review', { wentWell: went, improve: imp, taskActions });
      if (res.success) {
        const { moved, dropped } = res.data;
        addToast(moved || dropped ? `Review saved. ${moved} moved, ${dropped} dropped.` : 'Review saved');
        setActions({});
        setWentWell(null);
        setImprove(null);
        reload();
      }
    } catch (e) {
      addToast(formatApiError(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <section aria-label="Today in numbers" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {d.tasks && <StatCard title="Tasks done" value={d.tasks.completed} animate icon={CheckCircle2} color="emerald" />}
        {d.tasks && <StatCard title="Still open" value={d.tasks.openTotal} animate icon={Clock} color="rose" />}
        <StatCard title="Focus" value={`${d.focus?.minutes || 0}m`} icon={Clock} color="amber" />
        {d.habits && <StatCard title="Habits" value={`${d.habits.done}/${d.habits.total}`} icon={Flame} color="indigo" />}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
        {d.tasks && (
          <SectionCard title="Unfinished tasks" icon={Clock}>
            {open.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Nothing left over" description="Every task due today is done or cleared." />
            ) : (
              <>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Pick what happens to each one, then save your review.</p>
                <ul className="space-y-2">
                  {open.map((t) => (
                    <li key={t._id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                      <p className="font-medium text-slate-900 dark:text-white truncate">{t.title}</p>
                      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`What to do with ${t.title}`}>
                        <Button size="sm" variant={actions[t._id] === 'tomorrow' ? 'primary' : 'secondary'} aria-pressed={actions[t._id] === 'tomorrow'} icon={ArrowRight} onClick={() => setAction(t._id, 'tomorrow')}>Move to tomorrow</Button>
                        <Button size="sm" variant={actions[t._id] === 'drop' ? 'danger' : 'secondary'} aria-pressed={actions[t._id] === 'drop'} onClick={() => setAction(t._id, 'drop')}>Drop it</Button>
                      </div>
                    </li>
                  ))}
                </ul>
                {d.tasks.openTotal > open.length && (
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Showing {open.length} of {d.tasks.openTotal}. <Link to="/tasks" className="inline-flex items-center min-h-[36px] text-indigo-600 dark:text-indigo-400 hover:underline">See all tasks</Link></p>
                )}
              </>
            )}
          </SectionCard>
        )}

        <SectionCard title="Reflect on your day" icon={Moon} action={d.review?.saved ? <Badge variant="success">Saved today</Badge> : null}>
          <div className="space-y-4">
            <Textarea label="What went well today?" rows={3} maxLength={2000} value={went} onChange={(e) => setWentWell(e.target.value)} />
            <Textarea label="What will you change tomorrow?" rows={3} maxLength={2000} value={imp} onChange={(e) => setImprove(e.target.value)} />
            <Button onClick={save} loading={saving} className="w-full sm:w-auto">Save review</Button>
            {(d.spend !== null && d.spend !== undefined) && (
              <p className="text-xs text-slate-500 dark:text-slate-400">Spent today: {formatCurrency(d.spend, d.currency)}{d.meetingsToday ? ` · ${d.meetingsToday} meeting${d.meetingsToday === 1 ? '' : 's'} held` : ''}</p>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

/* ────────────────────────────────── Week ─────────────────────────────────── */

const pctOf = (x) => Math.round(Math.min(1, Math.max(0, x || 0)) * 100);

function delta(cur, prev) {
  if (prev === undefined || prev === null) return null;
  const diff = cur - prev;
  if (diff === 0) return 'same as last week';
  return `${diff > 0 ? '+' : ''}${diff} vs last week`;
}

/** Opt-in switch for the weekly report email. */
function DigestCard() {
  const { addToast } = useToast();
  const { data, loading, reload } = useApi('/briefing/preferences');
  const [busy, setBusy] = useState(false);
  if (loading && !data) return null;
  if (!data) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      await api.patch('/briefing/preferences', { weeklyDigest: !data.weeklyDigest });
      addToast(data.weeklyDigest ? 'Weekly email turned off' : 'Weekly email turned on');
      reload();
    } catch (e) {
      addToast(formatApiError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <Mail className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 dark:text-white">Get this report by email every Monday</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            A short summary of your last week, sent to your account email. Every email has a one-click unsubscribe link.
            {data.emailVerified === false && ' Verify your email address first, because emails are only sent to verified addresses.'}
          </p>
        </div>
      </div>
      <Button
        variant={data.weeklyDigest ? 'secondary' : 'primary'}
        onClick={toggle}
        loading={busy}
        className="sm:ml-auto shrink-0"
        aria-pressed={!!data.weeklyDigest}
      >
        {data.weeklyDigest ? 'Turn off' : 'Turn on'}
      </Button>
    </Card>
  );
}

function WeekTab() {
  const [week, setWeek] = useState(null); // 'YYYY-MM-DD' of any day in the week; null = current week
  const { data, loading, error, reload } = useApi(week ? `/briefing/weekly?week=${week}` : '/briefing/weekly', { deps: [week] });
  const { data: history } = useApi('/briefing/weekly/history');

  if (loading && !data) return <TabSkeleton />;
  if (error && !data) return <Card><ErrorState title="Your weekly report couldn't load" details={error} onRetry={reload} /></Card>;
  const d = data || {};
  const s = d.stats || {};
  const prev = d.previous?.hasData ? d.previous.stats : null;
  const start = d.week ? parseISO(d.week.start) : new Date();
  const shift = (days) => setWeek(format(addDays(start, days), 'yyyy-MM-dd'));
  const bars = [
    { label: 'Task follow-through', value: s.breakdown?.taskRate, color: 'indigo' },
    { label: 'Focus time (vs 7 h/week)', value: s.breakdown?.focusRatio, color: 'amber' },
    { label: 'Habit consistency', value: s.breakdown?.habitRatio, color: 'emerald' },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" size="sm" icon={ChevronLeft} onClick={() => shift(-7)} aria-label="Previous week">Prev</Button>
        <div className="text-center min-w-0">
          <p className="font-semibold text-slate-900 dark:text-white">
            {d.week ? `${format(start, 'MMM d')} – ${format(parseISO(d.week.end), 'MMM d, yyyy')}` : '…'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{d.isCurrent ? 'This week so far' : 'Completed week'}</p>
        </div>
        <Button variant="secondary" size="sm" disabled={d.isCurrent} onClick={() => shift(7)} aria-label="Next week">Next<ChevronRight className="w-4 h-4 ml-1" aria-hidden="true" /></Button>
      </div>

      <InsightCard ai={d.ai} onChange={reload} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        <SectionCard title="Productivity score" icon={Target} className="lg:col-span-1">
          {s.hasData === false ? (
            <EmptyState icon={Target} title="Not enough data yet" description="Complete a few tasks or check in a habit and your score appears here." />
          ) : (
            <>
              <p className="text-5xl font-bold tracking-tight text-slate-900 dark:text-white" aria-label={`Score ${d.score} out of 100`}>
                <AnimatedNumber value={d.score || 0} /><span className="text-xl text-slate-400 font-medium">/100</span>
              </p>
              {prev && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{delta(d.score, d.previous.score)}</p>}
              <div className="mt-5 space-y-4">
                {bars.map((b) => (
                  <div key={b.label}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-slate-600 dark:text-slate-300">{b.label}</span>
                      <span className="font-medium tabular-nums text-slate-900 dark:text-white">{pctOf(b.value)}%</span>
                    </div>
                    <ProgressBar value={pctOf(b.value)} color={b.color} label={b.label} />
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Parts with no data are left out, so you are not penalised for features you do not use.</p>
            </>
          )}
        </SectionCard>

        <div className="lg:col-span-2 space-y-6 sm:space-y-8 min-w-0">
          <section aria-label="This week in numbers" className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            <StatCard title="Tasks done" value={s.tasksCompleted ?? 0} animate icon={CheckCircle2} color="emerald" />
            <StatCard title="Not finished" value={s.tasksMissed ?? 0} animate icon={Clock} color="rose" />
            <StatCard title="Focus" value={`${Math.round(((s.focusMinutes || 0) / 60) * 10) / 10} h`} icon={Clock} color="amber" />
            <StatCard title="Habit check-ins" value={s.habitCheckins ?? 0} animate icon={Flame} color="indigo" />
            <StatCard title="Meetings" value={s.meetingsHeld ?? 0} animate icon={Video} color="amber" />
            {s.spend !== null && s.spend !== undefined && <StatCard title="Spent" value={formatCurrency(s.spend)} icon={Wallet} color="emerald" />}
          </section>
          {prev && <p className="text-xs text-slate-500 dark:text-slate-400 -mt-3">Tasks done: {delta(s.tasksCompleted, prev.tasksCompleted)}</p>}

          <SectionCard title="What stood out" icon={Sparkles}>
            {(d.insights || []).length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Nothing to report yet.</p>
            ) : (
              <ul className="space-y-2 text-sm sm:text-base text-slate-700 dark:text-slate-200 list-disc pl-5">
                {d.insights.map((line) => <li key={line}>{line}</li>)}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      {(history?.items || []).length > 0 && (
        <SectionCard title="Past weeks" icon={CalendarRange}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {history.items.map((h) => (
              <li key={h.week.start}>
                <button
                  type="button"
                  onClick={() => setWeek(h.week.start)}
                  className="w-full min-h-[44px] flex items-center justify-between gap-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg px-2 focus-visible:outline-2 focus-visible:outline-indigo-500"
                >
                  <span className="text-sm text-slate-700 dark:text-slate-200">{format(parseISO(h.week.start), 'MMM d')} – {format(parseISO(h.week.end), 'MMM d')}</span>
                  <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{h.score}/100</span>
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <DigestCard />
    </div>
  );
}

/* ────────────────────────────────── Page ─────────────────────────────────── */

export default function TodayPage() {
  const hour = new Date().getHours();
  const [tab, setTab] = useState(hour >= 18 ? 'evening' : 'morning');

  const onKey = (e) => {
    const i = TABS.findIndex((t) => t.id === tab);
    if (e.key === 'ArrowRight') setTab(TABS[(i + 1) % TABS.length].id);
    if (e.key === 'ArrowLeft') setTab(TABS[(i + TABS.length - 1) % TABS.length].id);
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader title="Today" description={format(new Date(), 'EEEE, MMMM do')} />

      <div role="tablist" aria-label="Today views" onKeyDown={onKey} className="inline-flex w-full sm:w-auto rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              id={`today-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={`today-panel-${t.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={`flex-1 sm:flex-none min-h-[44px] px-2 sm:px-6 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 sm:gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                active ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />{t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`today-panel-${tab}`} aria-labelledby={`today-tab-${tab}`} tabIndex={0} className="animate-fade-up focus:outline-none">
        {tab === 'morning' && <MorningTab />}
        {tab === 'evening' && <EveningTab />}
        {tab === 'week' && <WeekTab />}
      </div>
    </div>
  );
}
