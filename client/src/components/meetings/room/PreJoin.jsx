import React, { useState } from 'react';
import { Mic, MicOff, Video, VideoOff, Loader2, AlertTriangle, ShieldAlert, Wifi, WifiOff } from 'lucide-react';
import { mediaSupport } from '../../../hooks/useMeetingRoom.js';
import Logo from '../../Logo.jsx';

const Toggle = ({ on, onClick, onIcon: On, offIcon: Off, label }) => (
  <button type="button" onClick={onClick} aria-pressed={on} className={`flex min-h-[64px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl border text-sm font-semibold transition-[background-color,border-color,transform] duration-200 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${on ? 'border-sky-400/60 bg-sky-500/15 text-white' : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
    <span key={String(on)} className="flex animate-pop">{on ? <On className="h-5 w-5" aria-hidden="true" /> : <Off className="h-5 w-5" aria-hidden="true" />}</span>
    {label}: {on ? 'on' : 'off'}
  </button>
);

/** Slow or metered connections start with data saver on (the person can still switch it off). */
const slowConnection = () => {
  const c = typeof navigator !== 'undefined' ? navigator.connection : null;
  return Boolean(c && (c.saveData || ['slow-2g', '2g'].includes(c.effectiveType)));
};

/** Choose mic/camera before entering. Camera defaults to off — kinder to mobile data and to people joining from a bus. */
export default function PreJoin({ title, subtitle, actionLabel = 'Join meeting', busy, error, notice, onJoin, exit, defaultCam = false, noun = 'meeting' }) {
  const support = mediaSupport();
  const [mic, setMic] = useState(support.ok);
  const [cam, setCam] = useState(defaultCam);
  const [saver, setSaver] = useState(slowConnection);
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-6 text-white">
     <div className="page-enter flex flex-col gap-5 rounded-3xl bg-white/[0.04] p-5 ring-1 ring-white/10 backdrop-blur-sm sm:p-7">
      <div className="space-y-2 text-center">
        <div className="flex flex-col items-center gap-1" aria-hidden="true">
          <Logo size={36} showText={false} />
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">LifeOS · Your personal digital life manager</p>
        </div>
        <h1 className="text-2xl font-black break-words">{title}</h1>
        {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
      </div>
      {notice && <p role="status" className="rounded-2xl bg-white/5 p-3 text-center text-sm text-slate-200 ring-1 ring-white/10">{notice}</p>}
      {error && <p role="alert" className="flex items-start gap-2 rounded-2xl bg-amber-500/10 p-3 text-sm text-amber-100 ring-1 ring-amber-400/30"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}</p>}
      {!support.ok && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl bg-sky-500/10 p-3 text-sm text-sky-100 ring-1 ring-sky-400/30">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{support.message} You can still join to watch and listen.{support.insecure && <span className="mt-1 block break-all text-xs text-sky-200/80">Now on: {window.location.origin}</span>}</span>
        </p>
      )}
      <div className="flex gap-3">
        <Toggle on={mic} onClick={() => setMic((v) => !v)} onIcon={Mic} offIcon={MicOff} label="Microphone" />
        <Toggle on={cam && !saver} onClick={() => !saver && setCam((v) => !v)} onIcon={Video} offIcon={VideoOff} label="Camera" />
      </div>
      <button type="button" onClick={() => setSaver((v) => !v)} aria-pressed={saver} className={`flex min-h-[56px] w-full items-center gap-3 rounded-2xl border px-4 py-2 text-left text-sm transition-[background-color,border-color,transform] duration-200 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${saver ? 'border-emerald-400/60 bg-emerald-500/15 text-white' : 'border-white/15 bg-white/5 text-slate-300'}`}>
        {saver ? <WifiOff className="h-5 w-5 shrink-0" aria-hidden="true" /> : <Wifi className="h-5 w-5 shrink-0" aria-hidden="true" />}
        <span><b>Data saver: {saver ? 'on' : 'off'}</b><span className="block text-xs opacity-80">{saver ? 'Audio only. No video is sent or received. Uses far less data and battery.' : 'Turn on to save mobile data and battery. You will hear everyone but see no video.'}</span></span>
      </button>
      <button type="button" disabled={busy} onClick={() => onJoin({ mic, cam: cam && !saver, dataSaver: saver })} className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-sky-400 to-sky-500 text-base font-bold text-slate-950 shadow-lg shadow-sky-500/20 transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-60">
        {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
        {busy ? 'Joining…' : actionLabel}
      </button>
      {exit}
      <p className="text-center text-xs text-slate-500">{support.ok ? <>Your browser will ask to use your microphone{cam ? ' and camera' : ''}. You can change either at any time during the {noun}.</> : 'Turning on the camera or microphone needs a secure (HTTPS) connection.'}</p>
     </div>
    </div>
  );
}
