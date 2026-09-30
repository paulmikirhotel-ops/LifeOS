import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Spinner, Card, Badge } from '../../components/ui.jsx';
import MiniMarkdown from '../../components/meetings/MiniMarkdown.jsx';
import { meetingsApi } from '../../api/meetings.js';
import { ACTION_STATUS_LABELS, PRIORITY_LABELS, clock, speakerName } from '../../utils/meetingFormat.js';

/** Public, read-only page behind an explicit share link. No login, no recording. */
export default function SharedMeetingPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = 'Shared meeting — LifeOS';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    meetingsApi.publicMeeting(token).then((r) => setData(r.data)).catch((err) => setError(err?.code === 'NOT_FOUND' ? 'This link is invalid or has expired.' : 'Something went wrong. Please try again later.'));
    return () => robots.remove();
  }, [token]);

  if (error) return <div className="min-h-screen flex items-center justify-center p-6 text-center"><div><h1 className="text-xl font-bold text-slate-900 dark:text-white">Link unavailable</h1><p className="mt-2 text-slate-500">{error}</p></div></div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8 text-slate-900 dark:text-white">
      <p className="text-sm font-bold text-indigo-600">LifeOS</p>
      <header>
        <h1 className="text-2xl sm:text-3xl font-black break-words">{data.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{format(new Date(data.startAt), 'EEEE, MMMM d, yyyy · h:mm a')}{data.location ? ` · ${data.location}` : ''}</p>
        {data.participants?.length > 0 && <p className="mt-1 text-sm text-slate-500">Participants: {data.participants.join(', ')}</p>}
      </header>

      {data.summary?.executiveSummary && (
        <Card className="p-5 space-y-3">
          <h2 className="font-bold">Summary</h2>
          <p className="text-sm text-slate-700 dark:text-slate-300">{data.summary.executiveSummary}</p>
          {[['Decisions', 'decisions'], ['Next steps', 'nextSteps']].map(([label, k]) => data.summary[k]?.length > 0 && (
            <div key={k}><h3 className="text-sm font-bold">{label}</h3><ul className="list-disc pl-5 text-sm text-slate-700 dark:text-slate-300">{data.summary[k].map((t, i) => <li key={i}>{t}</li>)}</ul></div>
          ))}
        </Card>
      )}
      {data.minutes && <Card className="p-5 sm:p-6"><MiniMarkdown text={data.minutes} /></Card>}
      {data.actionItems?.length > 0 && (
        <Card className="p-5"><h2 className="font-bold mb-2">Action items</h2>
          <ul className="space-y-2 text-sm">{data.actionItems.map((a, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2"><span className={a.status === 'completed' ? 'line-through text-slate-400' : ''}>{a.task}</span>
              <span className="flex items-center gap-2 text-xs text-slate-500">{a.assigneeName || 'Unassigned'} · {a.deadline ? format(new Date(a.deadline), 'MMM d') : a.deadlineText || 'No deadline'} · {PRIORITY_LABELS[a.priority]} <Badge>{ACTION_STATUS_LABELS[a.status]}</Badge></span></li>))}</ul></Card>
      )}
      {data.transcript?.length > 0 && (
        <Card className="p-5"><h2 className="font-bold mb-2">Transcript</h2>
          <ol className="space-y-1.5 text-sm">{data.transcript.map((s) => <li key={s.seq}><span className="tabular-nums text-xs text-slate-400">{clock(s.startMs)}</span> <b>{speakerName(s)}:</b> {s.text}</li>)}</ol></Card>
      )}
      <p className="text-xs text-slate-400">Shared read-only via LifeOS. Expires {format(new Date(data.expiresAt), 'MMM d, yyyy')}. AI-generated content may contain mistakes.</p>
    </main>
  );
}
