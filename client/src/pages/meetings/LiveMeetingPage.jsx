import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Mic, MicOff, Pause, Play, Square, Users, Wifi, WifiOff, AlertTriangle, Loader2, ShieldAlert } from 'lucide-react';
import { Button, Card, EmptyState, Spinner } from '../../components/ui.jsx';
import TranscriptView from '../../components/meetings/TranscriptView.jsx';
import ConfirmDialog from '../../components/meetings/ConfirmDialog.jsx';
import { meetingsApi } from '../../api/meetings.js';
import { useMeetingRecorder, MESSAGES } from '../../hooks/useMeetingRecorder.js';
import { useLiveTranscription } from '../../hooks/useLiveTranscription.js';
import { timer, dayLabel, timeLabel } from '../../utils/meetingFormat.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useCapabilities } from '../../hooks/useCapabilities.js';
import { useNow } from '../../hooks/useNow.js';
import { Textarea } from '../../components/ui.jsx';
import { formatApiError } from '../../utils/errors.js';

/** The live meeting workspace: controls on the left, live transcript on the right (stacked on phones). */
export default function LiveMeetingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const feat = useCapabilities();
  const caps = feat.loaded ? { storage: feat.recording, liveTranscription: feat.transcription } : null;

  const [meeting, setMeeting] = useState(null);
  const [error, setError] = useState(null);
  const [consent, setConsent] = useState(false);
  const [starting, setStarting] = useState(false);
  const [segments, setSegments] = useState([]);
  const [filter, setFilter] = useState('');
  const [transcribeOn, setTranscribeOn] = useState(true);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const recovered = useRef(false);

  useEffect(() => {
    meetingsApi.get(id)
      .then((r) => setMeeting(r.data))
      .catch((err) => setError(err?.code === 'NOT_FOUND' ? 'This meeting doesn’t exist or you don’t have access.' : formatApiError(err)));
  }, [id]);

  const rec = useMeetingRecorder({ meetingId: id, startIndex: meeting?.recording?.nextChunkIndex || 0 });
  const canLive = Boolean(caps?.liveTranscription);
  const recActive = rec.state === 'recording';

  const live = useLiveTranscription({
    meetingId: id,
    stream: rec.stream,
    mimeType: rec.mimeType,
    active: recActive && transcribeOn,
    enabled: canLive && ['recording', 'paused'].includes(rec.state),
    getElapsedMs: rec.getElapsedMs,
    onSegments: (segs) => setSegments((cur) => [...cur, ...segs]),
  });

  // Load any transcript that already exists (page reload during a live meeting).
  useEffect(() => {
    if (meeting?.status !== 'live') return;
    meetingsApi.transcript(id, { limit: 500 }).then((r) => setSegments(r.data.items)).catch(() => {});
  }, [meeting?.status, id]);

  // Re-send audio left over from a crashed/closed tab (same recording session).
  useEffect(() => {
    if (meeting?.status !== 'live' || recovered.current || meeting.recording?.status !== 'recording') return;
    recovered.current = true;
    rec.recoverPending().then((n) => n > 0 && addToast(`Recovered ${n} unsent audio piece(s) from your last session.`));
  }, [meeting]); // eslint-disable-line react-hooks/exhaustive-deps

  const startMeeting = async () => {
    setStarting(true);
    try { setMeeting((await meetingsApi.start(id)).data); } catch (err) { addToast(formatApiError(err), 'error'); } finally { setStarting(false); }
  };

  const startRecording = async () => {
    if (!consent) return;
    await rec.start();
  };

  const finish = useCallback(async () => {
    setEnding(true);
    try {
      let body = {};
      if (['recording', 'paused', 'error'].includes(rec.state)) {
        const r = await rec.stop();
        if (r) body = { totalChunks: r.totalChunks, durationSec: r.durationSec };
        if (r?.pending > 0) addToast(`${r.pending} audio piece(s) couldn't be uploaded yet and are kept on this device.`, 'error');
      } else if (meeting?.recording?.status === 'recording') {
        body = { totalChunks: meeting.recording.nextChunkIndex };
      }
      await meetingsApi.end(id, body);
      addToast('Meeting ended — processing has started');
      navigate(`/meetings/${id}`, { replace: true });
    } catch (err) {
      addToast(formatApiError(err), 'error');
      setEnding(false);
      setConfirmEnd(false);
    }
  }, [rec, meeting, id, navigate, addToast]);

  if (error) return <div className="mx-auto max-w-lg py-16"><EmptyState title="Meeting unavailable" description={error} action={<Link to="/meetings"><Button>Back to meetings</Button></Link>} /></div>;
  if (!meeting) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  if (!meeting.canManage) return <div className="mx-auto max-w-lg py-16"><EmptyState icon={ShieldAlert} title="Only the organizer can run this meeting" description="You can follow it from the meeting page." action={<Link to={`/meetings/${id}`}><Button>Open meeting</Button></Link>} /></div>;
  if (['completed', 'cancelled'].includes(meeting.status)) return <div className="mx-auto max-w-lg py-16"><EmptyState title={`This meeting is ${meeting.status}`} description="Open it to review the recording, transcript and summary." action={<Link to={`/meetings/${id}`}><Button>Open meeting</Button></Link>} /></div>;

  // Without recording storage this page is a simple notes-only meeting room.
  if (feat.loaded && !feat.recording) {
    return <NotesRoom meeting={meeting} setMeeting={setMeeting} id={id} />;
  }
  if (!feat.loaded) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;

  const isLive = meeting.status === 'live';
  const previousSession = isLive && meeting.recording?.status === 'recording' && rec.state === 'idle';
  const storageOk = caps ? caps.storage : true;
  const shown = filter ? segments.filter((s) => s.text.toLowerCase().includes(filter.toLowerCase())) : segments;
  const recBadge = rec.state === 'recording' ? { t: 'Recording', c: 'text-red-600', dot: 'bg-red-500 animate-pulse' } : rec.state === 'paused' ? { t: 'Paused', c: 'text-amber-600', dot: 'bg-amber-500' } : rec.state === 'stopping' ? { t: 'Saving…', c: 'text-indigo-600', dot: 'bg-indigo-500 animate-pulse' } : { t: 'Not recording', c: 'text-slate-500', dot: 'bg-slate-300' };

  return (
    <div className="space-y-4 pb-40 lg:pb-8">
      <Link to={`/meetings/${id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600"><ChevronLeft className="w-4 h-4" aria-hidden="true" /> Meeting details</Link>

      <header className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white break-words">{meeting.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{dayLabel(meeting.startAt)} · {timeLabel(meeting.startAt)} – {timeLabel(meeting.endAt)}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><Users className="w-4 h-4" aria-hidden="true" />{(meeting.participants || []).map((p) => p.name).join(', ') || 'No participants'}</p>
          </div>
          <div className="text-right" role="status" aria-live="polite">
            <p className={`inline-flex items-center gap-2 text-sm font-bold ${recBadge.c}`}><span className={`h-2.5 w-2.5 rounded-full ${recBadge.dot}`} aria-hidden="true" />{rec.state === 'recording' ? '🔴 ' : ''}{recBadge.t}</p>
            <p className="text-3xl sm:text-4xl font-black tabular-nums text-slate-900 dark:text-white">{timer(rec.elapsedMs)}</p>
          </div>
        </div>
      </header>

      {rec.netIssue && <p role="alert" className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"><WifiOff className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />{MESSAGES.network} {rec.pending > 0 && `(${rec.pending} piece${rec.pending === 1 ? '' : 's'} waiting)`}</p>}
      {rec.error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />{rec.error}</p>}

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr] items-start">
        {/* Controls: a compact fixed bar on phones, a sticky card on desktop */}
        <div className="fixed inset-x-0 bottom-14 z-30 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:static lg:z-auto lg:border lg:rounded-2xl lg:p-5 lg:sticky lg:top-4">
          {!isLive ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">Starting the meeting lets you record and transcribe it.</p>
              <Button className="w-full min-h-[48px]" icon={Play} loading={starting} onClick={startMeeting}>Start meeting</Button>
            </div>
          ) : previousSession ? (
            <div className="space-y-3 text-sm">
              <p className="text-slate-600 dark:text-slate-300">A recording was already started for this meeting. It can’t be continued from a new page load, but everything saved so far is kept.</p>
              <Button className="w-full min-h-[48px]" variant="danger" icon={Square} loading={ending} onClick={() => setConfirmEnd(true)}>End meeting &amp; save recording</Button>
            </div>
          ) : rec.state === 'idle' || rec.state === 'requesting' ? (
            <div className="space-y-3">
              {!storageOk && <p className="text-xs text-red-600">Recording storage isn’t configured on the server, so audio can’t be saved.</p>}
              <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
                <span>Everyone in this meeting knows it is being recorded and transcribed.</span>
              </label>
              <Button className="w-full min-h-[48px]" icon={rec.state === 'requesting' ? Loader2 : Mic} disabled={!consent || !storageOk || rec.state === 'requesting'} onClick={startRecording}>
                {rec.state === 'requesting' ? 'Waiting for microphone…' : 'Start recording'}
              </Button>
              <Button className="w-full" variant="ghost" onClick={() => setConfirmEnd(true)}>End meeting without recording</Button>
            </div>
          ) : rec.state === 'stopping' ? (
            <div className="space-y-2" aria-live="polite">
              <p className="flex items-center gap-2 text-sm font-semibold text-indigo-600"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Uploading the last audio… {rec.pending} left</p>
              <p className="text-xs text-slate-500">Keep this page open. If the connection is slow, unsent audio stays on this device.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {recActive ? (
                  <Button variant="secondary" className="min-h-[52px] flex-col" onClick={rec.pause} aria-label="Pause recording"><Pause className="w-5 h-5" /><span className="text-xs mt-0.5">Pause</span></Button>
                ) : (
                  <Button variant="secondary" className="min-h-[52px] flex-col" onClick={rec.resume} disabled={rec.state !== 'paused'} aria-label="Resume recording"><Play className="w-5 h-5" /><span className="text-xs mt-0.5">Resume</span></Button>
                )}
                <Button variant="secondary" className="min-h-[52px] flex-col" onClick={rec.toggleMute} aria-pressed={rec.muted} aria-label={rec.muted ? 'Unmute microphone' : 'Mute microphone'}>
                  {rec.muted ? <MicOff className="w-5 h-5 text-red-500" /> : <Mic className="w-5 h-5" />}<span className="text-xs mt-0.5">{rec.muted ? 'Unmute' : 'Mute'}</span>
                </Button>
                <Button variant="danger" className="min-h-[52px] flex-col" onClick={() => setConfirmEnd(true)} aria-label="Stop recording and end meeting"><Square className="w-5 h-5" /><span className="text-xs mt-0.5">Stop</span></Button>
              </div>
              <p className="hidden lg:flex items-center gap-2 text-xs text-slate-500">{rec.netIssue ? <WifiOff className="w-3.5 h-3.5 text-amber-500" /> : <Wifi className="w-3.5 h-3.5 text-emerald-500" />}{rec.uploaded} audio piece(s) saved{rec.pending ? ` · ${rec.pending} waiting` : ''}</p>
            </div>
          )}
        </div>

        <Card className="p-4 sm:p-5 lg:min-h-[28rem]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Live transcript</h2>
            <div className="flex items-center gap-2 text-xs">
              <span className={live.status === 'listening' ? 'text-emerald-600' : 'text-slate-400'} role="status">{!canLive ? 'Live transcription off' : live.status === 'listening' ? 'Transcribing…' : live.status === 'paused' ? 'Paused' : live.status === 'error' ? 'Catching up' : live.status === 'unavailable' ? 'Unavailable' : 'Idle'}</span>
              {canLive && ['recording', 'paused'].includes(rec.state) && (
                <Button size="sm" variant="secondary" onClick={() => setTranscribeOn((v) => !v)}>{transcribeOn ? 'Pause transcription' : 'Resume transcription'}</Button>
              )}
            </div>
          </div>
          {live.note && <p className="mb-2 text-xs text-amber-600">{live.note}</p>}
          {!canLive && caps && <p className="mb-2 text-xs text-slate-500">Live transcription needs a speech-to-text provider on the server. Audio can still be recorded; a full transcript is created after the meeting when speech-to-text is available.</p>}
          <TranscriptView
            segments={shown} startedAt={meeting.startedAt} live canEdit
            onSearch={(s) => setFilter(s)}
            onEdit={async (seq, patch) => { try { await meetingsApi.editSegment(id, seq, patch); setSegments((cur) => cur.map((x) => (x.seq === seq ? { ...x, ...patch, edited: true } : x))); } catch (err) { addToast(formatApiError(err), 'error'); throw err; } }}
            emptyHint={canLive ? 'Speech will appear here within a few seconds of being spoken. Speaker names are added after the meeting.' : 'Nothing to show yet.'}
          />
        </Card>
      </div>

      <ConfirmDialog
        open={confirmEnd} danger loading={ending}
        title="End this meeting?"
        message={rec.state === 'idle' ? 'The meeting will be marked completed.' : 'Recording stops and the remaining audio is uploaded. The transcript, summary and minutes are prepared in the background — your recording is saved first and never lost if AI processing fails.'}
        confirmLabel="End meeting" onConfirm={finish} onClose={() => setConfirmEnd(false)}
      />
    </div>
  );
}

/**
 * Notes-only meeting room: start the meeting, take notes (autosaved), end the meeting.
 * Used whenever recording isn't available on this server.
 */
function NotesRoom({ meeting, setMeeting, id }) {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const now = useNow(1000);
  const [notes, setNotes] = useState(meeting.notes || '');
  const [saveState, setSaveState] = useState('saved'); // saved | dirty | saving | error
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const lastSaved = useRef(meeting.notes || '');
  const live = meeting.status === 'live';

  const save = useCallback(async (value) => {
    setSaveState('saving');
    try {
      await meetingsApi.update(id, { notes: value });
      lastSaved.current = value;
      setSaveState((s) => (s === 'saving' ? 'saved' : s));
    } catch (err) {
      setSaveState('error');
      addToast(formatApiError(err), 'error');
    }
  }, [id, addToast]);

  // Autosave 1.5 s after typing stops.
  useEffect(() => {
    if (notes === lastSaved.current) return undefined;
    setSaveState('dirty');
    const t = setTimeout(() => save(notes), 1500);
    return () => clearTimeout(t);
  }, [notes, save]);

  // Don't lose unsaved notes by closing the tab.
  useEffect(() => {
    const warn = (e) => {
      if (notes !== lastSaved.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [notes]);

  const start = async () => {
    setBusy(true);
    try {
      setMeeting((await meetingsApi.start(id)).data);
    } catch (err) {
      addToast(formatApiError(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    setBusy(true);
    try {
      if (notes !== lastSaved.current) await meetingsApi.update(id, { notes });
      await meetingsApi.end(id, {});
      addToast('Meeting ended');
      navigate(`/meetings/${id}?tab=notes`, { replace: true });
    } catch (err) {
      addToast(formatApiError(err), 'error');
      setBusy(false);
      setConfirmEnd(false);
    }
  };

  const elapsed = live && meeting.startedAt ? timer(now - new Date(meeting.startedAt).getTime()) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-32 md:pb-8">
      <Link to={`/meetings/${id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600">
        <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Meeting details
      </Link>

      <header className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white break-words">{meeting.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{dayLabel(meeting.startAt)} · {timeLabel(meeting.startAt)} – {timeLabel(meeting.endAt)}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><Users className="w-4 h-4" aria-hidden="true" />{(meeting.participants || []).map((p) => p.name).join(', ') || 'No participants'}</p>
          </div>
          {live && (
            <div className="text-right" role="status">
              <p className="inline-flex items-center gap-2 text-sm font-bold text-emerald-600"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />In progress</p>
              <p className="text-3xl font-black tabular-nums text-slate-900 dark:text-white">{elapsed}</p>
            </div>
          )}
        </div>
      </header>

      {meeting.agenda && (
        <Card className="p-4 sm:p-5">
          <h2 className="mb-1 text-sm font-bold text-slate-900 dark:text-white">Agenda</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{meeting.agenda}</p>
        </Card>
      )}

      {!live ? (
        <Card className="p-5 space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">Start the meeting to begin taking notes. You can finish it when you’re done.</p>
          <Button className="min-h-[48px]" icon={Play} loading={busy} onClick={start}>Start meeting</Button>
        </Card>
      ) : (
        <Card className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Meeting notes</h2>
            <span className="text-xs text-slate-500" role="status" aria-live="polite">
              {saveState === 'saving' ? 'Saving…' : saveState === 'dirty' ? 'Unsaved changes' : saveState === 'error' ? 'Couldn’t save — retrying when you type' : 'All changes saved'}
            </span>
          </div>
          <Textarea aria-label="Meeting notes" rows={14} maxLength={20000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Type notes here. They save automatically." />
          <div className="fixed inset-x-0 bottom-14 z-30 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:static md:border-0 md:bg-transparent md:p-0 md:pb-0 flex justify-end">
            <Button variant="danger" icon={Square} className="min-h-[48px] w-full md:w-auto" onClick={() => setConfirmEnd(true)}>End meeting</Button>
          </div>
        </Card>
      )}

      <ConfirmDialog open={confirmEnd} danger loading={busy} title="End this meeting?" message="The meeting is marked completed and your notes are saved. You can still edit the notes afterwards." confirmLabel="End meeting" onConfirm={end} onClose={() => setConfirmEnd(false)} />
    </div>
  );
}
