import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useConnect } from '../../context/ConnectContext.jsx';
import { startRingtone, stopRingtone, audioLocked } from '../../utils/ringtone.js';
import { busyPath } from '../../utils/callState.js';

const TONES = ['bg-blue-600', 'bg-sky-600', 'bg-indigo-600', 'bg-cyan-600', 'bg-blue-700', 'bg-sky-700'];
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
const initialsOf = (n = '?') => n.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';

/**
 * The incoming-call screen for a PERSONAL Connect call. Shown on every LifeOS page because a call can come at any time.
 * It only ever reacts to Connect call events. Meeting invitations and meeting alerts use the normal notification system and never ring.
 * While I am already in a call or a meeting it stays silent and small, so the ring cannot leak into my microphone.
 */
export default function IncomingCall() {
  const { incoming, callActions } = useConnect();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const busy = busyPath(pathname);
  const ringId = incoming?.id;
  const [soundLocked, setSoundLocked] = useState(false);

  // One ring at a time; it stops the moment the call is answered, declined, cancelled, times out, or I am busy.
  useEffect(() => {
    if (ringId && !busy) startRingtone('incoming');
    else stopRingtone();
    return stopRingtone;
  }, [ringId, busy]);

  // Browsers keep sound locked until the page has been touched once. The screen still shows; tell the person why it is silent.
  useEffect(() => {
    if (!ringId || busy) { setSoundLocked(false); return undefined; }
    // Give the browser a moment to start the audio before deciding it is locked.
    const check = setTimeout(() => setSoundLocked(audioLocked()), 400);
    const unlocked = () => setSoundLocked(false);
    window.addEventListener('pointerdown', unlocked, { once: true });
    window.addEventListener('keydown', unlocked, { once: true });
    return () => {
      clearTimeout(check);
      window.removeEventListener('pointerdown', unlocked);
      window.removeEventListener('keydown', unlocked);
    };
  }, [ringId, busy]);

  // The server ends an unanswered call at the end of the ringing time; hide it at the same moment.
  // expiresAt was worked out from the server's "ringing time left", so a wrong clock on this phone cannot hide the call early.
  useEffect(() => {
    if (!incoming) return undefined;
    const end = incoming.expiresAt ?? new Date(incoming.ringingUntil).getTime();
    const t = setTimeout(() => callActions.dismiss(incoming), Math.max(0, end - Date.now()));
    return () => clearTimeout(t);
  }, [incoming, callActions]);

  if (!incoming) return null;
  const video = incoming.mode === 'video';
  const name = incoming.group ? incoming.title : incoming.callerName;
  const accept = () => {
    const call = incoming;
    stopRingtone();
    callActions.dismiss(call);
    navigate(`/connect/call/${call.id}`, { state: { title: call.title, mode: call.mode } });
  };
  const decline = () => {
    stopRingtone();
    callActions.decline(incoming);
  };

  if (busy) {
    // Already on a call or in a meeting: a quiet banner with Decline only (answering would have to leave the current call first).
    return (
      <div role="alert" className="fixed inset-x-3 top-3 z-[90] mx-auto flex max-w-sm items-center gap-3 rounded-2xl bg-slate-900 p-3 text-white shadow-2xl ring-1 ring-white/10">
        <span aria-hidden="true" className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${TONES[hash(name || '?') % TONES.length]}`}>{initialsOf(name)}</span>
        <p className="min-w-0 flex-1 truncate text-sm"><span className="font-bold">{name}</span> is calling…</p>
        <button type="button" onClick={decline} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-bold hover:bg-red-700">Decline</button>
      </div>
    );
  }

  return (
    <div role="alertdialog" aria-modal="true" aria-label={`Incoming ${video ? 'video' : 'voice'} call from ${name}`} className="fixed inset-0 z-[90] flex items-center justify-center bg-gradient-to-b from-slate-950 via-blue-950 to-slate-900 text-white sm:bg-slate-950/80 sm:backdrop-blur">
      <div className="flex h-full w-full max-w-md flex-col items-center justify-between px-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-[calc(4rem+env(safe-area-inset-top))] sm:h-auto sm:gap-12 sm:rounded-3xl sm:bg-gradient-to-b sm:from-slate-900 sm:to-blue-950 sm:py-12 sm:shadow-2xl">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm font-medium text-white/70">LifeOS {video ? 'video' : 'voice'} call</p>
          <span aria-hidden="true" className={`relative inline-flex h-32 w-32 items-center justify-center rounded-full text-4xl font-bold ring-4 ring-white/10 ${incoming.group ? 'rounded-3xl' : ''} ${TONES[hash(name || '?') % TONES.length]}`}>
            <span className="absolute inset-0 animate-ping rounded-full bg-white/10" />
            <span className="relative">{initialsOf(name)}</span>
          </span>
          <h2 className="max-w-full truncate text-2xl font-bold">{name}</h2>
          <p className="text-sm text-white/70">{incoming.group ? `${incoming.callerName} is calling…` : 'Incoming call…'}</p>
          {soundLocked && <p className="text-xs text-white/60">Tap anywhere to turn the ringtone on</p>}
        </div>
        <div className="flex w-full items-end justify-around">
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={decline} aria-label="Decline" className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 shadow-lg hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><PhoneOff className="h-7 w-7" aria-hidden="true" /></button>
            <span className="text-sm text-white/80">Decline</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={accept} aria-label="Answer" className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 shadow-lg hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">{video ? <Video className="h-7 w-7" aria-hidden="true" /> : <Phone className="h-7 w-7" aria-hidden="true" />}</button>
            <span className="text-sm text-white/80">Answer</span>
          </div>
        </div>
      </div>
    </div>
  );
}
