import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Mic, Pause, Play, Square, Loader2, WifiOff, AlertTriangle, Volume2, X, UserPlus, UserMinus } from 'lucide-react';
import { useMeetingRoom, useRoomAudioMixer } from '../../../hooks/useMeetingRoom.js';
import { useMeetingRecorder, MESSAGES } from '../../../hooks/useMeetingRecorder.js';
import { useLiveTranscription } from '../../../hooks/useLiveTranscription.js';
import { useRoomChat } from '../../../hooks/useRoomChat.js';
import { useNow } from '../../../hooks/useNow.js';
import { useToast } from '../../../context/ToastContext.jsx';
import { meetingsApi } from '../../../api/meetings.js';
import { timer } from '../../../utils/meetingFormat.js';
import { formatApiError } from '../../../utils/errors.js';
import { Modal, Button } from '../../ui.jsx';
import TranscriptView from '../TranscriptView.jsx';
import RemoteAudio from './RemoteAudio.jsx';
import RoomAudioPanel from './RoomAudioPanel.jsx';
import RoomGrid from './RoomGrid.jsx';
import RoomControls from './RoomControls.jsx';
import ParticipantsPanel from './ParticipantsPanel.jsx';
import ChatPanel from './ChatPanel.jsx';
import PreJoin from './PreJoin.jsx';
import Watermark from '../../Watermark.jsx';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The video room itself, shared by both doors (workspace members and invitation-link joiners).
 *
 *  getJoin  async () => room payload from the server (it decides who may enter and who the host is)
 *  ping     heartbeat for attendance;  leave   called once when this person leaves
 *  host     only for the organizer on the member page: { meetingId, status, liveTranscription, end(body) }
 *           — enables ending the meeting for everyone and the live transcript
 *  chat     everyone (members AND link joiners): { list(afterId), send(text) } — the in-meeting text chat
 *  recorder everyone (members AND link joiners): { storeKey, claim(), release(), beat({paused}), putChunk(index, blob, mime) }
 *           — lets any participant record when the organizer allows it. One recorder at a time; if they leave,
 *           somebody else can continue and the server joins the parts into one recording.
 */
export default function RoomView({ title, subtitle, getJoin, ping, leave, exitTo, exitLabel = 'Back to LifeOS', host = null, recorder = null, chat = null, kind = 'meeting', defaultCam = false }) {
  const call = kind === 'call';
  const noun = call ? 'call' : 'meeting';
  const navigate = useNavigate();
  const { addToast } = useToast();
  const room = useMeetingRoom({ ping, leave, noun });
  const mixer = useRoomAudioMixer(room.room);
  const now = useNow(1000);

  const [startedAt, setStartedAt] = useState(null);
  const [panel, setPanel] = useState(null); // 'people' | 'transcript' | 'chat' | null
  const [consent, setConsent] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [segments, setSegments] = useState([]);
  const [bannerHidden, setBannerHidden] = useState(false);

  // Short "X joined / X left" pills. Purely visual: it only compares the participant list between renders.
  const [rosterEvents, setRosterEvents] = useState([]);
  const knownRef = useRef(null);
  useEffect(() => {
    if (room.status !== 'connected') {
      knownRef.current = null;
      return undefined;
    }
    const current = new Map(room.participants.map((p) => [p.identity, p]));
    const known = knownRef.current;
    knownRef.current = new Map(current);
    if (!known) return undefined; // first snapshot: everyone already here, nothing to announce
    const fresh = [];
    current.forEach((p, id) => { if (!known.has(id) && !p.isLocal) fresh.push({ id: `${id}-in-${Date.now()}`, kind: 'in', name: p.name }); });
    known.forEach((p, id) => { if (!current.has(id) && !p.isLocal) fresh.push({ id: `${id}-out-${Date.now()}`, kind: 'out', name: p.name }); });
    if (!fresh.length) return undefined;
    setRosterEvents((cur) => [...cur, ...fresh].slice(-3));
    const ids = new Set(fresh.map((f) => f.id));
    const t = setTimeout(() => setRosterEvents((cur) => cur.filter((e) => !ids.has(e.id))), 3600);
    return () => clearTimeout(t);
  }, [room.participants, room.status]);

  // Calls: when everybody else has left, ask the server right away (it ends the call) instead of waiting for the next heartbeat.
  const hadOthers = useRef(false);
  const othersNow = room.participants.filter((p) => !p.isLocal).length;
  useEffect(() => {
    if (!call || room.status !== 'connected') { hadOthers.current = false; return undefined; }
    if (othersNow > 0) { hadOthers.current = true; return undefined; }
    if (!hadOthers.current) return undefined;
    const t = setTimeout(() => room.nudgeRecording(), 2500);
    return () => clearTimeout(t);
  }, [call, room.status, othersNow]); // eslint-disable-line react-hooks/exhaustive-deps

  const myKey = room.room?.localParticipant?.identity || null;
  const chatState = useRoomChat({ list: chat?.list, send: chat?.send, enabled: Boolean(chat) && room.status === 'connected', open: panel === 'chat', tick: room.chatTick, myKey });
  const sendChat = async (text) => {
    const ok = await chatState.post(text);
    if (ok) room.nudgeChat();
    return ok;
  };

  const rec = useMeetingRecorder({ meetingId: recorder?.storeKey || host?.meetingId, putChunk: recorder?.putChunk });
  const recOn = rec.state === 'recording';
  const iRecord = ['recording', 'paused', 'stopping'].includes(rec.state);
  const live = useLiveTranscription({
    meetingId: host?.meetingId,
    stream: rec.stream,
    mimeType: rec.mimeType,
    active: recOn,
    enabled: Boolean(host?.liveTranscription) && ['recording', 'paused'].includes(rec.state),
    getElapsedMs: rec.getElapsedMs,
    onSegments: (segs) => setSegments((cur) => [...cur, ...segs]),
  });

  // What the recording indicator shows: my own recorder instantly, otherwise what the server says (refreshed every few seconds).
  const recording = rec.state === 'recording' || rec.state === 'stopping' ? 'on' : rec.state === 'paused' ? 'paused' : room.recording;

  const join = useCallback(
    async ({ mic, cam, dataSaver }) => {
      const data = await room.connect(async () => {
        const d = await getJoin();
        return d;
      }, { mic, cam, dataSaver });
      if (data?.startedAt) setStartedAt(new Date(data.startedAt).getTime());
      if (data) addToast(data.recording ? 'You joined. This meeting is being recorded.' : `You joined the ${noun}.`);
    },
    [room, getJoin, addToast]
  );

  // ── recording (any participant, one at a time) ─────────────────────
  const startRecording = async () => {
    if (!consent || !recorder || starting) return;
    setStarting(true);
    try {
      const stream = await mixer.start(); // first: the browser only allows audio while the click is fresh
      let claim;
      try {
        claim = (await recorder.claim()).data;
      } catch (err) {
        mixer.stop();
        room.nudgeRecording();
        throw err;
      }
      const ok = await rec.start({ stream, startIndex: claim.startIndex });
      if (!ok) {
        mixer.stop();
        await Promise.resolve(recorder.release()).catch(() => {});
        return;
      }
      setRecordOpen(false);
      rec.recoverPending(); // audio from an earlier session on this device that never finished uploading
      room.nudgeRecording();
      addToast(room.hasAudio ? 'Recording continued. Everyone can see the recording indicator.' : 'Recording started. Everyone in the room can see the recording indicator.');
    } catch (err) {
      mixer.stop();
      addToast(formatApiError(err), 'error');
    } finally {
      setStarting(false);
    }
  };
  const pauseRecording = async () => {
    rec.pause();
    await Promise.resolve(recorder?.beat({ paused: true })).catch(() => {});
    room.nudgeRecording();
  };
  const resumeRecording = async () => {
    rec.resume();
    await Promise.resolve(recorder?.beat({ paused: false })).catch(() => {});
    room.nudgeRecording();
  };
  /** Stops MY recording, waits for my audio to reach the server, then frees the slot so someone else can continue. */
  const finishRecording = async () => {
    const r = ['recording', 'paused', 'error'].includes(rec.state) ? await rec.stop() : null;
    mixer.stop();
    await Promise.resolve(recorder?.release()).catch(() => {});
    room.nudgeRecording();
    if (r?.pending > 0) addToast(`${r.pending} audio piece(s) couldn't be uploaded yet and are kept on this device.`, 'error');
    return r;
  };

  // While I record: tell the server every 15 s that I'm still here (also covers pauses). If someone else has taken over
  // (my connection was gone for too long), stop my copy so nothing is recorded twice.
  const lostRef = useRef(false);
  useEffect(() => {
    if (!recorder || !['recording', 'paused'].includes(rec.state)) return undefined;
    lostRef.current = false;
    let stopped = false;
    const send = async () => {
      try {
        const r = await recorder.beat({ paused: rec.state === 'paused' });
        if (!stopped && r?.data?.holding === false && !lostRef.current) {
          lostRef.current = true;
          addToast('Someone else is now recording this meeting, so your recording was stopped.', 'error');
          await rec.stop({ waitMs: 5000 });
          mixer.stop();
        }
      } catch { /* a missed beat is harmless: the next one or the next upload renews it */ }
    };
    send();
    const id = setInterval(send, 15_000);
    return () => { stopped = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.state, recorder]);

  // The organizer ended the meeting while I was the recorder: send what's left, then free the slot.
  useEffect(() => {
    if (room.ended && ['recording', 'paused'].includes(rec.state) && !ending) finishRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.ended]);

  const exit = useCallback(() => navigate(exitTo, { replace: true }), [navigate, exitTo]);

  // ── host: end for everyone ──────────────────────────────────────────
  const endMeeting = async () => {
    setEnding(true);
    try {
      let body = {};
      if (iRecord || ['recording', 'paused', 'error'].includes(rec.state)) {
        const r = await finishRecording();
        if (r) body = { durationSec: r.durationSec };
      }
      await host.end(body);
      await room.sendControl({ type: 'ended' });
      await sleep(400); // let the message leave before the connection closes
      mixer.stop();
      room.disconnect();
      addToast('Meeting ended — the transcript and summary are being prepared.');
      exit();
    } catch (err) {
      addToast(formatApiError(err), 'error');
      setEnding(false);
    }
  };

  const leaveOnly = async () => {
    setLeaveOpen(false);
    if (['recording', 'paused', 'error'].includes(rec.state)) await finishRecording();
    room.disconnect();
    exit();
  };

  // ── screens ─────────────────────────────────────────────────────────
  const frame = (children) => <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-slate-950 text-white h-[100dvh] isolate"><Watermark variant="room" />{children}</div>;
  const exitButton = <Link to={exitTo} className="block text-center text-sm font-semibold text-slate-400 hover:text-white">{exitLabel}</Link>;

  if (room.status === 'disconnected') {
    return frame(
      <div className="flex flex-1 items-center justify-center overflow-y-auto">
        <PreJoin
          title={room.ended ? `The ${noun} has ended` : `You left the ${noun}`}
          notice={rec.state === 'stopping' ? `Finishing the recording upload (${rec.pending} left). Please keep this page open.` : room.notice || (room.ended ? null : `You can rejoin while the ${noun} is running.`)}
          actionLabel={call ? (room.ended ? 'Back to chats' : 'Rejoin call') : 'Rejoin meeting'}
          defaultCam={defaultCam}
          noun={noun}
          onJoin={room.ended ? () => exit() : join}
          exit={exitButton}
        />
      </div>
    );
  }

  if (room.status === 'idle' || room.status === 'connecting' || room.status === 'error') {
    const notStarted = room.error?.code === 'MEETING_NOT_STARTED';
    return frame(
      <div className="flex flex-1 items-center justify-center overflow-y-auto">
        <PreJoin
          title={title}
          subtitle={subtitle}
          actionLabel={call ? 'Join call' : host && host.status === 'scheduled' ? 'Start meeting & join' : 'Join meeting'}
          defaultCam={defaultCam}
          noun={noun}
          busy={room.status === 'connecting'}
          error={room.error?.message}
          notice={notStarted ? 'The organizer will start the meeting soon. Tap Join again in a moment.' : null}
          onJoin={join}
          exit={exitButton}
        />
      </div>
    );
  }

  const elapsed = startedAt ? timer(Math.max(0, now - startedAt)) : null;
  const people = room.participants;

  return frame(
    <>
      <RemoteAudio participants={people} />
      <RoomAudioPanel room={room.room} connected={room.status === 'connected'} dataSaver={room.dataSaver} setDataSaver={room.setDataSaver} />

      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold sm:text-lg">{title}</h1>
          {elapsed && <p className="text-xs tabular-nums text-slate-400">{elapsed}</p>}
        </div>
        {room.status === 'connected' && recording === 'off' && <p role="status" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200"><span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />Connected</p>}
        {room.status === 'reconnecting' && <p role="status" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-100"><span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" aria-hidden="true" />Reconnecting</p>}
        {recording !== 'off' && (
          <p role="status" className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${recording === 'on' ? 'bg-red-600/90' : 'bg-amber-500/90 text-slate-950'}`}>
            <span className={`h-2 w-2 rounded-full bg-white ${recording === 'on' ? 'rec-dot' : ''}`} aria-hidden="true" />
            {recording === 'on' ? 'Recording' : 'Recording paused'}
          </p>
        )}
      </header>

      {rosterEvents.length > 0 && (
        <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-16 z-30 flex flex-col items-center gap-2 px-4">
          {rosterEvents.map((e) => (
            <p key={e.id} className="pill-pop inline-flex max-w-full items-center gap-2 rounded-full bg-slate-800/95 px-4 py-2 text-sm font-semibold text-white shadow-lg ring-1 ring-white/10 backdrop-blur">
              {e.kind === 'in' ? <UserPlus className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" /> : <UserMinus className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
              <span className="truncate">{e.name} {e.kind === 'in' ? 'joined' : 'left'}</span>
            </p>
          ))}
        </div>
      )}
      {room.status === 'reconnecting' && <p role="status" className="animate-fade-up mx-4 mb-2 flex items-center gap-2 rounded-xl bg-amber-500/15 px-4 py-2 text-sm text-amber-100"><WifiOff className="h-4 w-4 animate-pulse" aria-hidden="true" /> Connection lost. Reconnecting…</p>}
      {!room.canPlayAudio && !bannerHidden && (
        <p role="alert" className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-sky-500/15 px-4 py-2 text-sm text-sky-100">
          <Volume2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">Your browser is blocking {noun} audio.</span>
          <button type="button" onClick={room.startAudio} className="rounded-lg bg-sky-500 px-3 py-1 text-xs font-bold text-slate-950">Enable audio</button>
        </p>
      )}
      {room.mediaError && (
        <p role="alert" className="mx-4 mb-2 flex items-start gap-2 rounded-xl bg-amber-500/15 px-4 py-2 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span className="flex-1">{room.mediaError}</span>
          <button type="button" aria-label="Dismiss" onClick={room.clearMediaError}><X className="h-4 w-4" /></button>
        </p>
      )}
      {rec.netIssue && <p role="alert" className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-amber-500/15 px-4 py-2 text-sm text-amber-100"><WifiOff className="h-4 w-4" aria-hidden="true" />{MESSAGES.network}{rec.pending > 0 && ` (${rec.pending} waiting)`}</p>}
      {rec.error && <p role="alert" className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-red-500/15 px-4 py-2 text-sm text-red-100"><AlertTriangle className="h-4 w-4" aria-hidden="true" />{rec.error}</p>}

      {recorder && (() => {
        const other = room.recorder && !room.recorder.mine;
        const otherLive = other && !room.recorder.stale;
        const interrupted = rec.state === 'idle' && ((other && room.recorder.stale) || (!room.recorder && room.hasAudio));
        const box = 'animate-fade-up mx-4 mb-2 rounded-2xl bg-white/5 px-4 py-2.5 ring-1 ring-white/10';
        if (rec.state === 'stopping') return <p className={`${box} flex items-center gap-2 text-sm font-semibold text-sky-300`}><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Uploading the last audio… {rec.pending} left</p>;
        if (['recording', 'paused'].includes(rec.state)) {
          return (
            <div className={`${box} flex flex-wrap items-center justify-between gap-2`}>
              <p className="text-sm font-semibold tabular-nums">{timer(rec.elapsedMs)} <span className="font-normal text-slate-400">recording · {rec.uploaded} piece(s) saved{rec.pending ? ` · ${rec.pending} waiting` : ''}</span></p>
              <span className="flex gap-2">
                {recOn
                  ? <Button variant="secondary" size="sm" icon={Pause} onClick={pauseRecording}>Pause</Button>
                  : <Button variant="secondary" size="sm" icon={Play} onClick={resumeRecording}>Resume</Button>}
                <Button variant="secondary" size="sm" icon={Square} onClick={finishRecording}>Stop</Button>
              </span>
            </div>
          );
        }
        if (otherLive) return <p className={`${box} text-xs text-slate-300`}><b className="text-white">{room.recorder.name}</b> is recording this meeting{room.recorder.paused ? ' (paused)' : ''}.</p>;
        if (!room.canRecord) {
          if (host && !room.recordingStorage) return <p className={`${box} text-xs text-slate-400`}>Recording storage isn't set up on the server, so this meeting can't be recorded.</p>;
          return null; // the organizer turned recording by participants off
        }
        return (
          <div className={`${box} flex flex-wrap items-center justify-between gap-2`}>
            <p className="text-xs text-slate-300">{interrupted ? (other ? `${room.recorder.name} stopped recording. Continue it so nothing is missed.` : 'The recording was interrupted. You can continue it.') : 'Anyone here can record this meeting. It is saved to the organizer.'}</p>
            <Button className={`min-h-[40px] ${interrupted ? '' : '!bg-red-600 hover:!bg-red-700'}`} size="sm" icon={Mic} onClick={() => setRecordOpen(true)}>{room.hasAudio ? 'Continue recording' : 'Record meeting'}</Button>
          </div>
        );
      })()}

      <main className="min-h-0 flex-1 px-3 pb-2 sm:px-4">
        <RoomGrid participants={people} />
      </main>

      <RoomControls
        room={room}
        count={people.length}
        onToggleParticipants={() => setPanel((p) => (p === 'people' ? null : 'people'))}
        onToggleTranscript={host?.liveTranscription ? () => setPanel((p) => (p === 'transcript' ? null : 'transcript')) : null}
        showTranscript={panel === 'transcript'}
        onToggleChat={chat ? () => setPanel((p) => (p === 'chat' ? null : 'chat')) : null}
        showChat={panel === 'chat'}
        chatUnread={chatState.unread}
        onLeave={() => (host || iRecord ? setLeaveOpen(true) : leaveOnly())}
        leaveLabel={call ? 'Leave call' : host ? 'Leave or end meeting' : 'Leave meeting'}
      />

      {panel === 'chat' && <ChatPanel messages={chatState.messages} myKey={myKey} onSend={sendChat} onClose={() => setPanel(null)} sending={chatState.sending} error={chatState.error} onClearError={chatState.clearError} />}
      {panel === 'people' && <ParticipantsPanel participants={people} onClose={() => setPanel(null)} />}
      {panel === 'transcript' && (
        <aside role="dialog" aria-label="Live transcript" className="panel-in fixed inset-x-0 bottom-0 z-40 flex max-h-[70dvh] flex-col rounded-t-3xl border border-white/10 bg-white text-slate-900 shadow-2xl lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-96 lg:rounded-none">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-base font-bold">Live transcript <span className="text-xs font-normal text-slate-500">{live.status === 'listening' ? '· transcribing…' : recOn ? '' : '· start recording to transcribe'}</span></h2>
            <button type="button" onClick={() => setPanel(null)} aria-label="Close transcript" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><X className="h-5 w-5" /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {live.note && <p className="mb-2 text-xs text-amber-600">{live.note}</p>}
            <TranscriptView segments={segments} startedAt={startedAt ? new Date(startedAt).toISOString() : null} live emptyHint="Speech from everyone in the room appears here a few seconds after it is spoken. Speaker names are added after the meeting." />
          </div>
        </aside>
      )}

      <Modal isOpen={leaveOpen} onClose={() => !ending && setLeaveOpen(false)} title={host ? 'Leave or end the meeting?' : 'Leave the meeting?'}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {iRecord
            ? `You are recording.${host ? ' Ending stops the recording, uploads the remaining audio and closes the meeting for everyone.' : ''} If you leave, your recording stops after your audio is saved. Anyone still in the meeting can continue it.`
            : 'Ending closes the meeting for everyone. You can also leave and keep it running for the others.'}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setLeaveOpen(false)} disabled={ending}>Stay</Button>
          <Button variant={host ? 'secondary' : 'danger'} onClick={leaveOnly} disabled={ending}>{iRecord ? 'Stop recording & leave' : host ? 'Leave, keep running' : 'Leave'}</Button>
          {host && <Button variant="danger" loading={ending} onClick={endMeeting}>End for everyone</Button>}
        </div>
      </Modal>

      <Modal isOpen={recordOpen} onClose={() => !starting && setRecordOpen(false)} title={room.hasAudio ? 'Continue recording?' : 'Record this meeting?'}>
        <label className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-sky-500" />
          <span>Everyone in this meeting knows it is being recorded and transcribed. They will see a recording indicator. The recording, transcript and summary belong to the meeting organizer.</span>
        </label>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setRecordOpen(false)} disabled={starting}>Cancel</Button>
          <Button className="!bg-red-600 hover:!bg-red-700" icon={starting ? Loader2 : Mic} disabled={!consent || starting} onClick={startRecording}>{room.hasAudio ? 'Continue recording' : 'Start recording'}</Button>
        </div>
      </Modal>
    </>
  );
}
