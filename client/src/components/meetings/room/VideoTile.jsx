import React, { useEffect, useRef } from 'react';
import { MicOff, Monitor } from 'lucide-react';
import { initials } from '../../../utils/meetingFormat.js';

const TONES = ['from-indigo-500 to-indigo-700', 'from-fuchsia-500 to-purple-700', 'from-sky-500 to-blue-700', 'from-emerald-500 to-teal-700', 'from-amber-500 to-orange-700', 'from-rose-500 to-pink-700'];
/** A stable colour per person, so avatars are easy to tell apart. */
const avatarTone = (name = '') => TONES[[...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];

/** One person (camera or avatar) or one shared screen. */
export default function VideoTile({ participant: p, screen = false, className = '' }) {
  const ref = useRef(null);
  const track = screen ? p.screenTrack : p.camTrack;

  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return undefined;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  const speaking = Boolean(p.isSpeaking && !screen && p.micOn);
  const label = screen ? `${p.isLocal ? 'Your' : `${p.name}'s`} screen` : `${p.name}${p.isLocal ? ' (You)' : ''}`;

  return (
    <div
      className={`tile-in relative overflow-hidden rounded-2xl bg-slate-800 ring-2 transition-[box-shadow,--tw-ring-color] duration-300 ${p.isSpeaking && !screen ? 'ring-emerald-400 shadow-[0_0_0_5px_rgb(52_211_153/0.16)]' : 'ring-white/5'} ${className}`}
      role="group"
      aria-label={label}
    >
      {track ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted // video element carries no audio; remote voices are played by <RemoteAudio>
          className={`tile-in h-full w-full ${screen ? 'object-contain bg-black' : 'object-cover'} ${p.isLocal && !screen ? '[transform:scaleX(-1)]' : ''}`}
        />
      ) : (
        <div className="tile-in flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
          <span className={`flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-gradient-to-br ${avatarTone(p.name)} text-xl sm:text-2xl font-black text-white shadow-lg transition-transform duration-300 ${speaking ? 'scale-110' : ''}`} aria-hidden="true">{initials(p.name)}</span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6 text-xs font-semibold text-white">
        {screen && <Monitor className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        <span className="truncate">{label}</span>
        {p.isHost && !screen && <span className="shrink-0 rounded bg-indigo-500/80 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Host</span>}
        {!p.micOn && !screen && <span className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500/90"><MicOff className="h-3.5 w-3.5 text-white" aria-label="Muted" /></span>}
        {speaking && (
          <span className="ml-auto flex h-4 shrink-0 items-end gap-0.5" aria-hidden="true">
            <span className="eq-bar h-full w-0.5 rounded-full bg-emerald-300" /><span className="eq-bar h-full w-0.5 rounded-full bg-emerald-300" /><span className="eq-bar h-full w-0.5 rounded-full bg-emerald-300" />
          </span>
        )}
      </div>
    </div>
  );
}
