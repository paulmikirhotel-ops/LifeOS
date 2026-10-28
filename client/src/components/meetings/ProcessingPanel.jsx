import React from 'react';
import { CheckCircle2, Loader2, AlertTriangle, Circle, RefreshCw, Play } from 'lucide-react';
import { Card, Button, Skeleton } from '../ui.jsx';
import { STAGE_LABELS } from '../../utils/meetingFormat.js';

const RETRY_STAGE = { transcript: 'transcribe', summary: 'analyze', minutes: 'minutes', actionItems: 'analyze' };

// What each state says for each stage, in plain language.
const TEXT = {
  recording: { done: 'Recording saved', processing: 'Processing recording…', pending: 'Waiting to process…', failed: 'Processing failed', idle: 'Not started' },
  transcript: { done: 'Transcript ready', processing: 'Generating transcript…', pending: 'Queued…', failed: 'Processing failed', idle: 'Not started' },
  summary: { done: 'Summary ready', processing: 'Generating AI summary…', pending: 'Queued…', failed: 'Processing failed', idle: 'Not started' },
  minutes: { done: 'Minutes ready', processing: 'Generating minutes…', pending: 'Queued…', failed: 'Processing failed', idle: 'Not started' },
  actionItems: { done: 'Ready', processing: 'Extracting action items…', pending: 'Queued…', failed: 'Processing failed', idle: 'Not started' },
};

function Row({ stage, label, state, onRetry, canRetry, retryLabel = 'Try again', retryIcon = RefreshCw }) {
  const map = {
    done: { icon: CheckCircle2, cls: 'text-emerald-500 animate-pop' },
    processing: { icon: Loader2, cls: 'text-indigo-500 animate-spin' },
    pending: { icon: Loader2, cls: 'text-indigo-400 animate-spin' },
    failed: { icon: AlertTriangle, cls: 'text-red-500' },
    idle: { icon: Circle, cls: 'text-slate-300' },
  };
  const s = map[state] ? state : 'idle';
  const Icon = map[s].icon;
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <Icon className={`w-4 h-4 shrink-0 ${map[s].cls}`} aria-hidden="true" />
        <span className="text-slate-700 dark:text-slate-200">{label}</span>
        <span className="truncate text-xs text-slate-500">{TEXT[stage][s]}</span>
      </span>
      {(state === 'failed' || state === 'idle') && canRetry && onRetry && (
        <Button size="sm" variant="secondary" icon={retryIcon} onClick={onRetry}>{retryLabel}</Button>
      )}
    </li>
  );
}

/**
 * Post-meeting processing status with per-stage retry. The recording is safe whatever happens here.
 * It reflects the REAL backend state: queued / generating / ready / failed - and, for a finished meeting whose
 * recording is saved but whose transcript never started, an explicit "not started" row with a Start button
 * (this used to be invisible, which is why a missing transcript looked like nothing was happening).
 */
export default function ProcessingPanel({ meeting, canManage, onRetry, speechToText = true, className = '' }) {
  const p = meeting.processing || {};
  const rec = meeting.recording?.status;
  const completed = meeting.status === 'completed';
  const hasSegments = (meeting.stats?.segmentCount || 0) > 0;
  const recState = rec === 'ready' ? 'done' : rec === 'uploading' ? 'processing' : rec === 'failed' ? 'failed' : rec === 'recording' ? (completed ? 'pending' : 'idle') : 'idle';

  const stages = ['transcript', 'summary', 'minutes', 'actionItems'];
  const anyActive = stages.some((k) => ['pending', 'processing'].includes(p[k])) || rec === 'uploading' || (completed && rec === 'recording');
  const anyFailed = stages.some((k) => p[k] === 'failed') || rec === 'failed';
  // Recording is saved, the meeting is over, and nothing ever started the transcript.
  const transcriptStalled = completed && rec === 'ready' && !hasSegments && (!p.transcript || p.transcript === 'idle') && !anyActive;
  if (!anyActive && !anyFailed && !transcriptStalled) return null;

  // Technical detail (such as which setting is missing) is for the organizer; everyone else gets a plain message.
  const detail = canManage && p.lastError ? p.lastError : null;

  return (
    <Card className={`p-4 ${className}`}>
      <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Meeting processing</h3>
      <ul aria-live="polite">
        <Row stage="recording" label="Recording" state={recState} canRetry={canManage} onRetry={() => onRetry('finalize')} />
        <Row
          stage="transcript"
          label={STAGE_LABELS.transcript}
          state={transcriptStalled ? 'idle' : p.transcript}
          canRetry={canManage && (speechToText || p.transcript === 'failed')}
          onRetry={() => onRetry(RETRY_STAGE.transcript)}
          retryLabel={transcriptStalled ? 'Start' : 'Try again'}
          retryIcon={transcriptStalled ? Play : RefreshCw}
        />
        {!transcriptStalled && <Row stage="summary" label={STAGE_LABELS.summary} state={p.summary} canRetry={canManage} onRetry={() => onRetry(RETRY_STAGE.summary)} />}
        {!transcriptStalled && <Row stage="minutes" label={STAGE_LABELS.minutes} state={p.minutes} canRetry={canManage} onRetry={() => onRetry(RETRY_STAGE.minutes)} />}
        {!transcriptStalled && <Row stage="actionItems" label={STAGE_LABELS.actionItems} state={p.actionItems} canRetry={canManage} onRetry={() => onRetry(RETRY_STAGE.actionItems)} />}
      </ul>
      {!transcriptStalled && ['pending', 'processing'].includes(p.summary) && (
        <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50" aria-hidden="true">
          <Skeleton className="h-3 w-1/3" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-5/6" />
        </div>
      )}
      {transcriptStalled && (
        <p className="mt-2 text-xs text-slate-500">
          The recording is saved, but its transcript hasn't been generated yet.{canManage ? ' Press Start to generate it now.' : ''}
        </p>
      )}
      {anyFailed && (
        <p role="alert" className="mt-2 text-xs text-slate-500">
          Your meeting and recording are safe, but processing could not be completed.{canManage ? ' You can try again.' : ' The organizer can try again.'}
          {detail ? <span className="block text-slate-500 mt-1">Details: {detail}</span> : null}
        </p>
      )}
    </Card>
  );
}
