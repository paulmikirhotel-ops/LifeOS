import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, History, Video } from 'lucide-react';
import { Button, EmptyState } from '../../components/ui.jsx';
import { UpcomingMeetingCard, RecentMeetingCard } from '../../components/meetings/MeetingCard.jsx';
import { CardSkeleton } from '../../components/meetings/Skeleton.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useNow } from '../../hooks/useNow.js';
import { useTenant } from '../../context/TenantContext.jsx';

export default function MeetingDashboardPage() {
  const now = useNow(1000);
  const { can } = useTenant();
  const upcoming = useApi('/meetings?scope=upcoming&limit=8');
  const recent = useApi('/meetings?scope=past&status=completed&limit=6');

  // Refresh the upcoming list every 30 s so "Live" / "Starting soon" stay accurate.
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === 'visible' && upcoming.reload(), 30_000);
    return () => clearInterval(id);
  }, [upcoming.reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const up = upcoming.data?.items || [];
  const rec = recent.data?.items || [];

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section aria-labelledby="up-h">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="up-h" className="text-lg font-bold text-slate-900 dark:text-white">Upcoming meetings</h2>
          <Link to="/meetings/calendar" className="text-sm font-semibold text-indigo-600 hover:underline">Calendar</Link>
        </div>
        {upcoming.loading && !upcoming.data ? (
          <CardSkeleton />
        ) : upcoming.error ? (
          <p role="alert" className="text-sm text-red-600">Couldn’t load meetings. {upcoming.error}</p>
        ) : up.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No upcoming meetings"
            description="Schedule a meeting and it will show up here and in your calendar."
            action={can('meetings.create') ? <Link to="/meetings/new"><Button>Schedule a meeting</Button></Link> : null}
          />
        ) : (
          <div className="space-y-3">{up.map((m) => <UpcomingMeetingCard key={m.id} meeting={m} now={now} />)}</div>
        )}
      </section>

      <section aria-labelledby="rec-h">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="rec-h" className="text-lg font-bold text-slate-900 dark:text-white">Recent meetings</h2>
          <Link to="/meetings/history" className="text-sm font-semibold text-indigo-600 hover:underline">All history</Link>
        </div>
        {recent.loading && !recent.data ? (
          <CardSkeleton />
        ) : rec.length === 0 ? (
          <EmptyState icon={History} title="Nothing here yet" description="Completed meetings appear here with their recording, transcript and summary." />
        ) : (
          <div className="space-y-3">{rec.map((m) => <RecentMeetingCard key={m.id} meeting={m} />)}</div>
        )}
      </section>

      {up.length === 0 && rec.length === 0 && !upcoming.loading && !recent.loading && (
        <div className="lg:col-span-2 flex justify-center text-slate-400"><Video className="w-8 h-8" aria-hidden="true" /></div>
      )}
    </div>
  );
}
