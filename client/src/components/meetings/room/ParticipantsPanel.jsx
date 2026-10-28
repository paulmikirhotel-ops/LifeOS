import React from 'react';
import { X, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { initials } from '../../../utils/meetingFormat.js';

/** Bottom sheet on phones, right-hand panel on desktop. Closing never leaves the meeting. */
export default function ParticipantsPanel({ participants, onClose }) {
  return (
    <aside
      role="dialog"
      aria-label="Participants"
      className="panel-in fixed inset-x-0 bottom-0 z-40 flex max-h-[70dvh] flex-col rounded-t-3xl border border-white/10 bg-slate-900 text-white shadow-2xl lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-80 lg:rounded-none"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h2 className="text-base font-bold">Participants ({participants.length})</h2>
        <button type="button" onClick={onClose} aria-label="Close participants" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"><X className="h-5 w-5" /></button>
      </div>
      <ul className="flex-1 overflow-y-auto px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {participants.map((p) => (
          <li key={p.identity} className={`tile-in flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/5 ${p.isSpeaking ? 'bg-emerald-400/10' : ''}`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-xs font-bold ring-2 transition-shadow ${p.isSpeaking ? 'ring-emerald-400' : 'ring-transparent'}`} aria-hidden="true">{initials(p.name)}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}{p.isLocal ? ' (You)' : ''}{p.isHost && <span className="ml-2 rounded bg-indigo-500/80 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Host</span>}</span>
            {p.micOn ? <Mic className="h-4 w-4 text-emerald-300" aria-label="Microphone on" /> : <MicOff className="h-4 w-4 text-red-300" aria-label="Muted" />}
            {p.camOn ? <Video className="h-4 w-4 text-emerald-300" aria-label="Camera on" /> : <VideoOff className="h-4 w-4 text-slate-500" aria-label="Camera off" />}
          </li>
        ))}
      </ul>
    </aside>
  );
}
