import React from 'react';
import { CheckCircle2, Loader2, AlertTriangle, Circle, RefreshCw } from 'lucide-react';
import { Card, Button } from '../ui.jsx';
import { STAGE_LABELS } from '../../utils/meetingFormat.js';

const RETRY_STAGE = { transcript: 'transcribe', summary: 'analyze', minutes: 'minutes', actionItems: 'analyze' };

function Row({ label, state, error, onRetry, canRetry }) {
  const map = {
    done: { icon: CheckCircle2, cls: 'text-emerald-500', text: 'ready' },
    processing: { icon: Loader2, cls: 'text-indigo-500 animate-spin', text: 'processing…' },
    pending: { icon: Loader2, cls: 'text-indigo-400 animate-spin', text: 'queued…' },
    failed: { icon: AlertTriangle, cls: 'text-red-500', text: 'failed' },
    idle: { icon: Circle, cls: 'text-slate-300', text: 'not started' },
  };
  const m = map[state] || map.idle;
  const Icon = m.icon;
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span className="flex items-center gap-2 text-sm">
        <Icon className={`w-4 h-4 ${m.cls}`} aria-hidden="true" />
        <span className="text-slate-700 dark:text-slate-200">{label}</span>
        <span className="text-xs text-slate-400">{m.text}</span>
      </span>
      {state === 'failed' && canRetry && (
        <Button size="sm" variant="secondary" icon={RefreshCw} onClick={onRetry} title={error}>Try again</Button>
      )}
    </li>
  );
}

/** Post-meeting processing status with per-stage retry. The recording is safe whatever happens here. */
export default function ProcessingPanel({ meeting, canManage, onRetry, className = '' }) {
  const p = meeting.processing || {};
  const rec = meeting.recording?.status;
  const recState = rec === 'ready' ? 'done' : rec === 'uploading' ? 'processing' : rec === 'failed' ? 'failed' : rec === 'recording' ? 'pending' : 'idle';
  const anyActive = ['transcript', 'summary', 'minutes', 'actionItems'].some((k) => ['pending', 'processing'].includes(p[k])) || rec === 'uploading';
  const anyFailed = ['transcript', 'summary', 'minutes', 'actionItems'].some((k) => p[k] === 'failed') || rec === 'failed';
  if (!anyActive && !anyFailed) return null;

  return (
    <Card className={`p-4 ${className}`}>
      <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Meeting processing</h3>
      <ul aria-live="polite">
        <Row label="Recording saved" state={recState} canRetry={canManage} onRetry={() => onRetry('finalize')} />
        <Row label={`${STAGE_LABELS.transcript} processing`} state={p.transcript} error={p.lastError} canRetry={canManage} onRetry={() => onRetry(RETRY_STAGE.transcript)} />
        <Row label={`${STAGE_LABELS.summary} processing`} state={p.summary} error={p.lastError} canRetry={canManage} onRetry={() => onRetry(RETRY_STAGE.summary)} />
        <Row label={`${STAGE_LABELS.minutes} processing`} state={p.minutes} error={p.lastError} canRetry={canManage} onRetry={() => onRetry(RETRY_STAGE.minutes)} />
        <Row label={`${STAGE_LABELS.actionItems} processing`} state={p.actionItems} error={p.lastError} canRetry={canManage} onRetry={() => onRetry(RETRY_STAGE.actionItems)} />
      </ul>
      {anyFailed && (
        <p className="mt-2 text-xs text-slate-500">
          Your meeting was saved, but AI processing could not be completed. You can try again.
          {p.lastError ? <span className="block text-slate-400 mt-1">Details: {p.lastError}</span> : null}
        </p>
      )}
    </Card>
  );
}
