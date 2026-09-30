import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Clock, MapPin, Users, Play, Radio, Mic, FileText, Sparkles, ListChecks } from 'lucide-react';
import { Card, Button, Badge } from '../ui.jsx';
import StatusBadge from './StatusBadge.jsx';
import { statusInfo, typeLabel, rangeLabel, formatCountdown, formatDuration } from '../../utils/meetingFormat.js';
import { useTenant } from '../../context/TenantContext.jsx';

/** Upcoming meeting card: title, when, participants, type, status, countdown, Start/Join. */
export function UpcomingMeetingCard({ meeting, now }) {
  const navigate = useNavigate();
  const { can } = useTenant();
  const s = statusInfo(meeting, now);
  const startMs = new Date(meeting.startAt).getTime();
  const isLive = meeting.status === 'live';
  const canRun = can('meetings.edit');
  const names = (meeting.participants || []).map((p) => p.name);

  return (
    <Card className="p-4 sm:p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/meetings/${meeting.id}`} className="block font-bold text-slate-900 dark:text-white truncate hover:text-indigo-600">
            {meeting.title}
          </Link>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            {rangeLabel(meeting)}
          </p>
        </div>
        <StatusBadge meeting={meeting} now={now} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" aria-hidden="true" />{names.length ? (names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ')) : 'No participants'}</span>
        <Badge variant="info">{typeLabel(meeting.type)}</Badge>
        {meeting.location && <span className="inline-flex items-center gap-1 truncate max-w-[14rem]"><MapPin className="w-3.5 h-3.5" aria-hidden="true" />{meeting.location}</span>}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400" aria-live="off">
          {isLive ? 'In progress' : s.key === 'missed' ? '—' : `Starts in ${formatCountdown(startMs - now)}`}
        </span>
        {canRun && (isLive || s.key === 'soon' || s.key === 'scheduled') && (
          <Button
            size="md"
            icon={isLive ? Radio : Play}
            className="min-h-[44px]"
            onClick={() => navigate(`/meetings/${meeting.id}/live`)}
          >
            {isLive ? 'Join' : 'Start'}
          </Button>
        )}
      </div>
    </Card>
  );
}

const Chip = ({ ok, icon: Icon, label }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'}`}>
    <Icon className="w-3 h-3" aria-hidden="true" />
    {label}
  </span>
);

/** Recent/past meeting card: duration, participants and availability of recording/transcript/summary. */
export function RecentMeetingCard({ meeting }) {
  const names = (meeting.participants || []).map((p) => p.name);
  const hasRec = meeting.recording?.status === 'ready';
  const tab = (t) => `/meetings/${meeting.id}?tab=${t}`;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/meetings/${meeting.id}`} className="block font-bold text-slate-900 dark:text-white truncate hover:text-indigo-600">{meeting.title}</Link>
          <p className="mt-1 text-xs text-slate-500">{rangeLabel(meeting)} · {formatDuration(meeting.durationSec)}</p>
        </div>
        <StatusBadge meeting={meeting} now={Date.now()} />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 truncate"><Users className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />{names.join(', ') || 'No participants'}</p>
      {meeting.matchedIn?.length > 0 && <p className="mt-1 text-[11px] font-medium text-indigo-600">Match in {meeting.matchedIn.join(' & ')}</p>}
      {(hasRec || meeting.hasTranscript || meeting.hasSummary || meeting.hasMinutes) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip ok={hasRec} icon={Mic} label="Recording" />
          <Chip ok={Boolean(meeting.hasTranscript)} icon={FileText} label="Transcript" />
          <Chip ok={Boolean(meeting.hasSummary)} icon={Sparkles} label="Summary" />
          <Chip ok={Boolean(meeting.hasMinutes)} icon={ListChecks} label="Minutes" />
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
        <Link className="text-indigo-600 hover:underline" to={`/meetings/${meeting.id}`}>View</Link>
        {meeting.hasTranscript && <Link className="text-indigo-600 hover:underline" to={tab('transcript')}>Transcript</Link>}
        {meeting.hasSummary && <Link className="text-indigo-600 hover:underline" to={tab('summary')}>Summary</Link>}
        {meeting.hasMinutes && <Link className="text-indigo-600 hover:underline" to={tab('minutes')}>Minutes</Link>}
        {hasRec && <Link className="text-indigo-600 hover:underline" to={tab('recording')}>Recording</Link>}
        <Link className="text-indigo-600 hover:underline" to={`/meetings/${meeting.id}?export=1`}>Download</Link>
      </div>
    </Card>
  );
}
