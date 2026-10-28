import React from 'react';
import { Mic, MicOff, Video, VideoOff, MonitorUp, SwitchCamera, PhoneOff, Users, Captions, Wifi, WifiOff, MessageCircle } from 'lucide-react';

const TONES = {
  neutral: 'bg-white/10 text-white hover:bg-white/20 active:bg-white/25',
  active: 'bg-white text-slate-900 hover:bg-slate-200 active:bg-slate-300',
  off: 'bg-red-500 text-white hover:bg-red-400 active:bg-red-600',
  warn: 'bg-amber-500 text-slate-950 hover:bg-amber-400 active:bg-amber-600',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
};

/** One control: a 48px+ round touch target with a short visible caption, so the state is readable without hovering. */
function Ctl({ onClick, label, caption, tone = 'neutral', pressed, badge, children, hideOnPhone = false }) {
  return (
    <div className={`flex w-14 shrink-0 flex-col items-center gap-1 sm:w-16 ${hideOnPhone ? 'hidden sm:flex' : ''}`}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={pressed}
        title={label}
        className={`relative flex h-12 w-12 items-center justify-center rounded-full transition-[background-color,transform,box-shadow] duration-200 active:scale-90 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:h-14 sm:w-14 ${TONES[tone]}`}
      >
        <span key={String(pressed)} className="flex animate-pop">{children}</span>
        {badge ? <span className="absolute -right-1 -top-1 min-w-[1.25rem] rounded-full bg-indigo-500 px-1 text-center text-[11px] font-bold leading-5 text-white">{badge}</span> : null}
      </button>
      <span className="max-w-full truncate text-[11px] font-semibold leading-none text-slate-300">{caption}</span>
    </div>
  );
}

const canShareScreen = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia);

/** Bottom control bar: big touch targets, wraps instead of overflowing on small phones. */
export default function RoomControls({ room, count, onToggleParticipants, onToggleTranscript, showTranscript, onToggleChat, showChat, chatUnread = 0, onLeave, leaveLabel = 'Leave meeting' }) {
  const blocked = room.mediaOk === false; // insecure origin / no camera API: the buttons stay, but explain themselves when pressed
  const micTone = blocked ? 'warn' : room.micOn ? 'neutral' : 'off';
  const camTone = blocked ? 'warn' : room.dataSaver ? 'neutral' : room.camOn ? 'neutral' : 'off';
  return (
    <div className="px-2 pt-1 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]">
    <div role="toolbar" aria-label="Meeting controls" className="mx-auto flex w-fit max-w-full flex-wrap items-start justify-center gap-x-2 gap-y-3 rounded-3xl bg-slate-900/80 px-3 py-3 ring-1 ring-white/10 shadow-2xl shadow-black/40 backdrop-blur-md sm:gap-x-3 sm:px-5">
      <Ctl label={room.micOn ? 'Mute microphone' : 'Unmute microphone'} caption={blocked ? 'Mic blocked' : room.micOn ? 'Mic on' : 'Muted'} tone={micTone} pressed={room.micOn} onClick={room.toggleMic}>
        {room.micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </Ctl>
      <Ctl label={room.camOn ? 'Turn camera off' : 'Turn camera on'} caption={blocked ? 'Cam blocked' : room.dataSaver ? 'Audio only' : room.camOn ? 'Camera on' : 'Camera off'} tone={camTone} pressed={room.camOn} onClick={room.toggleCam}>
        {room.camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
      </Ctl>
      {room.camOn && <Ctl label="Switch camera" caption="Flip" onClick={room.flipCamera}><SwitchCamera className="h-5 w-5" /></Ctl>}
      {canShareScreen && <Ctl label={room.screenOn ? 'Stop sharing screen' : 'Share your screen'} caption={room.screenOn ? 'Stop' : 'Share'} tone={room.screenOn ? 'active' : 'neutral'} pressed={room.screenOn} onClick={room.toggleScreen} hideOnPhone><MonitorUp className="h-5 w-5" /></Ctl>}
      <Ctl label={room.dataSaver ? 'Turn data saver off (receive video)' : 'Turn data saver on (audio only, saves data)'} caption={room.dataSaver ? 'Saver on' : 'Saver'} tone={room.dataSaver ? 'active' : 'neutral'} pressed={room.dataSaver} onClick={() => room.setDataSaver(!room.dataSaver)}>
        {room.dataSaver ? <WifiOff className="h-5 w-5" /> : <Wifi className="h-5 w-5" />}
      </Ctl>
      {onToggleChat && <Ctl label="Chat" caption="Chat" tone={showChat ? 'active' : 'neutral'} pressed={showChat} onClick={onToggleChat} badge={chatUnread > 0 ? (chatUnread > 9 ? '9+' : chatUnread) : null}><MessageCircle className="h-5 w-5" /></Ctl>}
      <Ctl label="Participants" caption="People" onClick={onToggleParticipants} badge={count}><Users className="h-5 w-5" /></Ctl>
      {onToggleTranscript && <Ctl label="Live transcript" caption="Captions" tone={showTranscript ? 'active' : 'neutral'} pressed={showTranscript} onClick={onToggleTranscript}><Captions className="h-5 w-5" /></Ctl>}
      <Ctl label={leaveLabel} caption="Leave" tone="danger" onClick={onLeave}><PhoneOff className="h-5 w-5" /></Ctl>
    </div>
    </div>
  );
}
