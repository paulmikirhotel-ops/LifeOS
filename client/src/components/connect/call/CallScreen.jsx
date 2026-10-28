import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, Video, VideoOff, SwitchCamera, PhoneOff, Volume2, AlertTriangle, X } from 'lucide-react';
import { useMeetingRoom } from '../../../hooks/useMeetingRoom.js';
import { useWakeLock } from '../../../hooks/useWakeLock.js';
import RemoteAudio from '../../meetings/room/RemoteAudio.jsx';
import RoomAudioPanel from '../../meetings/room/RoomAudioPanel.jsx';
import { startRingtone, stopRingtone } from '../../../utils/ringtone.js';
import { callPhase, phaseText, endedText, formatDuration, pickMain } from '../../../utils/callState.js';

const TONES = ['bg-blue-600', 'bg-sky-600', 'bg-indigo-600', 'bg-cyan-600', 'bg-blue-700', 'bg-sky-700'];
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
const initialsOf = (n = '?') => n.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';

function Face({ name, size = 'h-32 w-32 text-4xl', speaking = false, group = false }) {
  return (
    <span aria-hidden="true" className={`inline-flex items-center justify-center font-bold text-white ${size} ${group ? 'rounded-3xl' : 'rounded-full'} ${TONES[hash(name || '?') % TONES.length]} ${speaking ? 'ring-4 ring-emerald-400' : 'ring-4 ring-white/10'} transition-shadow`}>
      {initialsOf(name)}
    </span>
  );
}

function Video_({ track, mirror = false, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return undefined;
    track.attach(el);
    return () => track.detach(el);
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted className={`${className} ${mirror ? '-scale-x-100' : ''}`} />;
}

function Round({ label, onClick, active = true, danger = false, children, disabled }) {
  return (
    <div className="flex w-[4.5rem] flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={danger ? undefined : !active}
        className={`flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40 ${danger ? 'bg-red-600 hover:bg-red-700' : active ? 'bg-white/15 hover:bg-white/25' : 'bg-white text-slate-900 hover:bg-slate-200'}`}
      >
        {children}
      </button>
      <span className="text-xs font-medium text-white/80">{label}</span>
    </div>
  );
}

/**
 * The personal call screen for Connect: a WhatsApp-style voice or video call between friends.
 * It is NOT the meeting room: no grid, no recording, no chat panel, no meeting controls. It joins the call's own LiveKit room and
 * reports presence/leave through the Connect call API only, so it can never create, join or end a meeting.
 */
export default function CallScreen({ title: titleHint, mode: modeHint = 'voice', group: groupHint = false, getJoin, ping, leave, exitTo = '/connect/chats' }) {
  const navigate = useNavigate();
  const room = useMeetingRoom({ ping, leave, noun: 'call' });
  const [meta, setMeta] = useState({ title: titleHint, group: groupHint });
  const [everConnected, setEverConnected] = useState(false);
  const [connectedAt, setConnectedAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [attempt, setAttempt] = useState(0);
  const [bannerOff, setBannerOff] = useState(false);
  const hungUp = useRef(false);

  // Join as soon as the screen opens (the tap on Call / Answer started this, so audio is allowed).
  useEffect(() => {
    const t = setTimeout(async () => {
      const data = await room.connect(getJoin, { mic: true, cam: modeHint === 'video' });
      if (data?.call) setMeta({ title: data.call.title || titleHint, group: data.call.group });
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const people = room.participants;
  const remotes = people.filter((p) => !p.isLocal);
  const me = people.find((p) => p.isLocal);
  const phase = callPhase({ status: room.status, remoteCount: remotes.length, everConnected, ended: room.ended });

  useEffect(() => {
    if (remotes.length > 0 && !everConnected) {
      setEverConnected(true);
      setConnectedAt(Date.now());
    }
  }, [remotes.length, everConnected]);

  // Timer tick, only while it is shown.
  useEffect(() => {
    if (phase !== 'live' && phase !== 'reconnecting') return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Ringback for the caller until someone picks up; silent once connected, ended, or if we left.
  useEffect(() => {
    if (phase !== 'calling') return undefined;
    // Short delay: for the person answering, the caller is already in the room a moment after joining, so no ringback is wanted.
    const t = setTimeout(() => startRingtone('ringback'), 800);
    return () => {
      clearTimeout(t);
      stopRingtone();
    };
  }, [phase]);
  useEffect(() => stopRingtone, []);

  // When the call is over, say so for a moment and return to the chat.
  useEffect(() => {
    if (phase !== 'ended' || hungUp.current) return undefined;
    const t = setTimeout(() => navigate(exitTo, { replace: true }), 1800);
    return () => clearTimeout(t);
  }, [phase, navigate, exitTo]);

  const hasVideo = room.camOn || remotes.some((p) => p.camOn && p.camTrack);
  useWakeLock(phase === 'live' || phase === 'calling' || phase === 'reconnecting');

  const hangUp = useCallback(() => {
    hungUp.current = true;
    stopRingtone();
    room.disconnect();
    navigate(exitTo, { replace: true });
  }, [room, navigate, exitTo]);

  const main = pickMain(people);
  const others = remotes.filter((p) => p !== main);
  const seconds = connectedAt ? (now - connectedAt) / 1000 : 0;
  const status = phase === 'live' ? formatDuration(seconds) : phase === 'ended' ? endedText(everConnected) : phaseText(phase, { group: meta.group });
  const headline = meta.title || (remotes[0]?.name ?? 'Call');

  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-gradient-to-b from-slate-950 via-blue-950 to-slate-900 text-white" role="main" aria-label={`${hasVideo ? 'Video' : 'Voice'} call with ${headline}`}>
      <RemoteAudio participants={people} />

      {/* Video: the other person fills the screen */}
      {hasVideo && main && <Video_ track={main.camTrack} className="absolute inset-0 h-full w-full object-cover" />}
      {hasVideo && main && <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60" />}

      <header className="relative z-10 px-4 pb-2 pt-[calc(1rem+env(safe-area-inset-top))] text-center">
        <h1 className="truncate text-xl font-bold drop-shadow">{headline}</h1>
        <p role="status" aria-live="polite" className={`mt-0.5 text-sm tabular-nums ${phase === 'reconnecting' ? 'text-amber-300' : 'text-white/80'}`}>{status}</p>
      </header>

      {/* Voice (or nobody's camera yet): big picture(s) */}
      {!(hasVideo && main) && (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-6">
          {remotes.length <= 1 ? (
            <Face name={headline} group={meta.group && remotes.length === 0} speaking={Boolean(remotes[0]?.isSpeaking)} />
          ) : (
            <div className="flex max-w-md flex-wrap items-start justify-center gap-5">
              {remotes.map((p) => (
                <div key={p.identity} className="flex w-20 flex-col items-center gap-2">
                  <Face name={p.name} size="h-16 w-16 text-xl" speaking={p.isSpeaking} />
                  <span className="max-w-full truncate text-xs text-white/80">{p.name}</span>
                </div>
              ))}
            </div>
          )}
          {phase === 'calling' && <span className="h-2 w-2 animate-ping rounded-full bg-white/70" aria-hidden="true" />}
        </div>
      )}

      {/* Video call, more than one other person: small strip */}
      {hasVideo && main && others.length > 0 && (
        <ul className="relative z-10 mx-4 mt-2 flex gap-2 overflow-x-auto">
          {others.map((p) => (
            <li key={p.identity} className="w-16 shrink-0 text-center">
              {p.camOn && p.camTrack ? <Video_ track={p.camTrack} className="h-16 w-16 rounded-xl object-cover" /> : <Face name={p.name} size="h-16 w-16 text-lg" speaking={p.isSpeaking} />}
              <span className="block truncate text-[10px] text-white/80">{p.name}</span>
            </li>
          ))}
        </ul>
      )}
      {hasVideo && main && <div className="flex-1" />}

      {/* My own small picture */}
      {room.camOn && me?.camTrack && (
        <div className="absolute right-3 top-[calc(7.75rem+env(safe-area-inset-top))] z-20 h-36 w-24 overflow-hidden rounded-2xl bg-slate-800 shadow-2xl ring-2 ring-white/30 sm:h-44 sm:w-32">
          <Video_ track={me.camTrack} mirror className="h-full w-full object-cover" />
        </div>
      )}

      {/* Messages */}
      <div className="relative z-10 space-y-2 px-4">
        {!room.canPlayAudio && room.status === 'connected' && (
          <button type="button" onClick={room.startAudio} className="mx-auto flex items-center gap-2 rounded-full bg-sky-500 px-4 py-2 text-sm font-bold text-slate-950">
            <Volume2 className="h-4 w-4" aria-hidden="true" /> Tap to turn on sound
          </button>
        )}
        {room.mediaError && !bannerOff && (
          <p role="alert" className="mx-auto flex max-w-md items-start gap-2 rounded-xl bg-amber-500/20 px-4 py-2 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">{room.mediaError}</span>
            <button type="button" aria-label="Dismiss" onClick={() => { room.clearMediaError(); setBannerOff(true); }}><X className="h-4 w-4" /></button>
          </p>
        )}
        {phase === 'error' && (
          <div role="alert" className="mx-auto max-w-md rounded-xl bg-red-500/20 px-4 py-3 text-center text-sm text-red-100">
            <p>{room.error?.message || 'Could not connect the call.'}</p>
            <button type="button" onClick={() => { setBannerOff(false); setAttempt((a) => a + 1); }} className="mt-2 rounded-lg bg-white px-4 py-1.5 font-bold text-slate-900">Try again</button>
          </div>
        )}
      </div>

      {/* Controls */}
      <footer className="relative z-10 flex items-start justify-center gap-4 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
        <Round label={room.micOn ? 'Mute' : 'Unmute'} active={room.micOn} onClick={room.toggleMic} disabled={phase === 'connecting' || phase === 'ended'}>
          {room.micOn ? <Mic className="h-6 w-6" aria-hidden="true" /> : <MicOff className="h-6 w-6" aria-hidden="true" />}
        </Round>
        <Round label={room.camOn ? 'Camera off' : 'Camera'} active={room.camOn} onClick={room.toggleCam} disabled={phase === 'connecting' || phase === 'ended'}>
          {room.camOn ? <Video className="h-6 w-6" aria-hidden="true" /> : <VideoOff className="h-6 w-6" aria-hidden="true" />}
        </Round>
        {room.camOn && (
          <Round label="Flip" onClick={room.flipCamera}>
            <SwitchCamera className="h-6 w-6" aria-hidden="true" />
          </Round>
        )}
        <Round label={phase === 'ended' ? 'Close' : 'End'} danger onClick={hangUp}>
          <PhoneOff className="h-6 w-6" aria-hidden="true" />
        </Round>
      </footer>

      <RoomAudioPanel room={room.room} connected={room.status === 'connected'} dataSaver={room.dataSaver} setDataSaver={room.setDataSaver} />
    </div>
  );
}
