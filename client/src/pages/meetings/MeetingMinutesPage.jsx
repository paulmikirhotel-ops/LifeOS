import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Printer } from 'lucide-react';
import { Spinner, Card, Badge, Button } from '../../components/ui.jsx';
import MiniMarkdown from '../../components/meetings/MiniMarkdown.jsx';
import Watermark from '../../components/Watermark.jsx';
import { meetInviteApi, passStore } from '../../api/meetInvite.js';
import { ACTION_STATUS_LABELS, PRIORITY_LABELS } from '../../utils/meetingFormat.js';

/**
 * Read-only minutes for people who joined by link.
 *   /meet/:token/minutes  → opened with the meeting pass this browser earned when joining
 *   /minutes/:key         → opened from the personal link in the "minutes ready" e-mail
 * Never shows audio or the transcript. Everything is owned by the meeting organizer.
 */
export default function MeetingMinutesPage() {
  const { token, key } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = 'Meeting minutes — LifeOS';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    const run = key ? meetInviteApi.minutesByKey(key) : meetInviteApi.minutes(token, passStore.get(token));
    run.then((r) => setData(r.data)).catch((e) => {
      const code = e?.code;
      setError(
        code === 'MINUTES_OFF' ? 'The organizer has not shared the minutes of this meeting.'
          : code === 'PASS_REQUIRED' || code === 'PASS_INVALID' ? 'Open the link from the "minutes ready" e-mail, or ask the organizer to send you the minutes. (Your browser\'s access to this meeting has expired.)'
            : code === 'NOT_FOUND' ? 'This minutes link is not valid.'
              : e?.message || 'Something went wrong. Please try again.'
      );
    });
    return () => robots.remove();
  }, [token, key]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Minutes unavailable</h1>
          <p className="text-slate-500">{error}</p>
          <Link to="/" className="inline-block text-indigo-600 underline">Back to LifeOS</Link>
        </div>
      </div>
    );
  }
  if (!data) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;

  return (
    <main className="relative isolate mx-auto max-w-3xl space-y-5 p-4 sm:p-8 text-slate-900 dark:text-white">
      <Watermark />
      <p className="text-sm font-bold text-indigo-600">LifeOS</p>
      <header>
        <h1 className="text-2xl sm:text-3xl font-black break-words">{data.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{format(new Date(data.startAt), 'EEEE, MMMM d, yyyy · h:mm a')} · Organized by {data.organizerName}</p>
      </header>

      {!data.ready ? (
        <Card className="p-5 text-sm text-slate-600 dark:text-slate-300" role="status">{data.message}</Card>
      ) : (
        <>
          <div className="print:hidden"><Button variant="secondary" icon={Printer} onClick={() => window.print()} className="min-h-[44px]">Print / save as PDF</Button></div>
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
            <Card className="p-5">
              <h2 className="font-bold mb-2">Action items</h2>
              <ul className="space-y-2 text-sm">
                {data.actionItems.map((a, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                    <span className={a.status === 'completed' ? 'line-through text-slate-400' : ''}>{a.task}</span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">{a.assigneeName || 'Unassigned'} · {a.deadline ? format(new Date(a.deadline), 'MMM d') : a.deadlineText || 'No deadline'} · {PRIORITY_LABELS[a.priority]} <Badge>{ACTION_STATUS_LABELS[a.status]}</Badge></span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
      <p className="text-xs text-slate-400">Shared read-only by the meeting organizer via LifeOS. AI-generated content may contain mistakes.</p>
    </main>
  );
}
