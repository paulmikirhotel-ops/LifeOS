import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RoomEvent } from 'livekit-client';
import { SlidersHorizontal, Mic, Volume2, Headphones, WifiOff, X } from 'lucide-react';
import { useAudioQuality } from '../../../hooks/useAudioQuality.js';
import { QUALITY_TEXT } from '../../../utils/audioQuality.js';
import { captureOptions, loadAudioPrefs, saveAudioPrefs, speakerPickerSupported } from '../../../utils/audioConfig.js';

const DOT = { good: 'bg-emerald-400', fair: 'bg-amber-400', poor: 'bg-red-500', unknown: 'bg-slate-500' };

/** Live microphone level while the panel is open. The signal is only measured, never played, so it cannot cause echo. */
function useMicLevel(room, active) {
  const [level, setLevel] = useState(0);
  const [state, setState] = useState('idle'); // idle | ok | off
  useEffect(() => {
    if (!active || !room) return undefined;
    const track = room.localParticipant?.getTrackPublication?.('microphone')?.track?.mediaStreamTrack;
    if (!track) {
      setState('off');
      setLevel(0);
      return undefined;
    }
    setState('ok');
    let ctx;
    let raf;
    let last = 0;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      ctx = new Ctx();
      const src = ctx.createMediaStreamSource(new MediaStream([track]));
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an); // deliberately NOT connected to ctx.destination
      const buf = new Uint8Array(an.fftSize);
      const loop = (t) => {
        raf = requestAnimationFrame(loop);
        if (t - last < 90) return;
        last = t;
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += ((buf[i] - 128) / 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
      };
      raf = requestAnimationFrame(loop);
    } catch {
      setState('idle');
    }
    return () => {
      cancelAnimationFrame(raf);
      ctx?.close().catch(() => {});
    };
  }, [room, active]);
  return { level, state };
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="flex items-start justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-slate-400">{hint}</span>
      </span>
      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-blue-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/**
 * Audio panel for meetings AND Connect calls: microphone / speaker choice, a mic level test, voice-processing switches,
 * and a live connection check with advice when the network is weak.
 */
export default function RoomAudioPanel({ room, connected, dataSaver, setDataSaver }) {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(loadAudioPrefs);
  const [mics, setMics] = useState([]);
  const [speakers, setSpeakers] = useState([]);
  const [activeMic, setActiveMic] = useState('');
  const [activeSpeaker, setActiveSpeaker] = useState('');
  const [notice, setNotice] = useState('');
  const [bannerOff, setBannerOff] = useState(false);
  const noticeTimer = useRef(null);
  const quality = useAudioQuality(room, connected);
  const meter = useMicLevel(room, open && connected);

  const say = useCallback((text) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 6000);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setMics(all.filter((d) => d.kind === 'audioinput' && d.deviceId));
      setSpeakers(all.filter((d) => d.kind === 'audiooutput' && d.deviceId));
      setActiveMic(room?.getActiveDevice?.('audioinput') || '');
      setActiveSpeaker(room?.getActiveDevice?.('audiooutput') || '');
      return all;
    } catch {
      return [];
    }
  }, [room]);

  useEffect(() => {
    if (!connected || !room) return undefined;
    refreshDevices();
    const onChange = async () => {
      const all = await refreshDevices();
      const micId = room.getActiveDevice?.('audioinput');
      if (micId && !all.some((d) => d.kind === 'audioinput' && d.deviceId === micId)) say('Your microphone was disconnected. Pick another one in Audio settings.');
      else say('Audio devices changed.');
    };
    const onActive = (kind, id) => {
      if (kind === 'audioinput') setActiveMic(id);
      if (kind === 'audiooutput') setActiveSpeaker(id);
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    room.on(RoomEvent.ActiveDeviceChanged, onActive);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
      room.off(RoomEvent.ActiveDeviceChanged, onActive);
    };
  }, [room, connected, refreshDevices, say]);

  useEffect(() => {
    if (quality.level !== 'poor') setBannerOff(false);
  }, [quality.level]);

  if (!connected) return null;

  const pickMic = async (id) => {
    try {
      await room.switchActiveDevice('audioinput', id);
      const next = { ...prefs, micId: id };
      setPrefs(next);
      saveAudioPrefs(next);
      say('Microphone changed.');
    } catch {
      say('Could not switch to that microphone.');
    }
  };
  const pickSpeaker = async (id) => {
    try {
      await room.switchActiveDevice('audiooutput', id);
      const next = { ...prefs, speakerId: id };
      setPrefs(next);
      saveAudioPrefs(next);
      say('Speaker changed.');
    } catch {
      say('Could not switch to that speaker.');
    }
  };
  const setFlag = async (key, value) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    saveAudioPrefs(next);
    try {
      const audio = room.localParticipant.getTrackPublication('microphone')?.audioTrack;
      if (audio) await audio.restartTrack(captureOptions(next));
    } catch {
      say('Could not apply that right now. It will apply next time you join.');
    }
  };

  const camOn = Boolean(room.localParticipant?.isCameraEnabled);
  const text = QUALITY_TEXT[quality.level];
  const poor = quality.level === 'poor' && !bannerOff;

  return (
    <>
      <div className="absolute right-3 top-[calc(4.25rem+env(safe-area-inset-top))] z-30 flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`Audio settings. ${text}`}
          className="relative flex h-11 w-11 items-center justify-center rounded-full bg-slate-800/90 text-white shadow-lg ring-1 ring-white/10 backdrop-blur hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          <span className={`absolute right-1 top-1 h-3 w-3 rounded-full ring-2 ring-slate-800 ${DOT[quality.level]}`} aria-hidden="true" />
        </button>

        {open && (
          <div role="dialog" aria-label="Audio settings" className="w-[min(22rem,calc(100vw-1.5rem))] max-h-[70vh] overflow-y-auto rounded-2xl bg-slate-900 p-4 text-white shadow-2xl ring-1 ring-white/10">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Audio</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <p className="mt-2 flex items-center gap-2 text-sm" role="status">
              <span className={`h-2.5 w-2.5 rounded-full ${DOT[quality.level]}`} aria-hidden="true" />
              <span className="font-semibold">{text}</span>
              {quality.level !== 'unknown' && <span className="text-xs text-slate-400">{quality.lossPct.toFixed(1)}% lost{quality.rttMs ? ` · ${Math.round(quality.rttMs)} ms` : ''}</span>}
            </p>

            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="ap-mic">Microphone</label>
            <div className="mt-1 flex items-center gap-2">
              <Mic className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <select id="ap-mic" value={activeMic || prefs.micId} onChange={(e) => pickMic(e.target.value)} className="min-h-[40px] w-full rounded-lg bg-slate-800 px-2 text-sm">
                {mics.length === 0 && <option value="">No microphone found</option>}
                {mics.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}
              </select>
            </div>
            <div className="mt-2" aria-label="Microphone level">
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-100" style={{ width: `${Math.round(meter.level * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-400">{meter.state === 'off' ? 'Your microphone is off. Turn it on to test it.' : 'Speak. The bar should move if people can hear you.'}</p>
            </div>

            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="ap-spk">Speaker</label>
            {speakerPickerSupported() ? (
              <div className="mt-1 flex items-center gap-2">
                <Volume2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <select id="ap-spk" value={activeSpeaker || prefs.speakerId} onChange={(e) => pickSpeaker(e.target.value)} className="min-h-[40px] w-full rounded-lg bg-slate-800 px-2 text-sm">
                  {speakers.length === 0 && <option value="">Default speaker</option>}
                  {speakers.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${i + 1}`}</option>)}
                </select>
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-400">This browser plays sound through your device&apos;s main speaker. Change it in your device&apos;s sound settings.</p>
            )}

            <div className="mt-4 divide-y divide-white/5">
              <Toggle label="Echo cancellation" hint="Stops people hearing themselves." checked={prefs.echoCancellation} onChange={(v) => setFlag('echoCancellation', v)} />
              <Toggle label="Noise reduction" hint="Reduces background noise and keyboard sounds." checked={prefs.noiseSuppression} onChange={(v) => setFlag('noiseSuppression', v)} />
              <Toggle label="Automatic volume" hint="Keeps your voice at an even level." checked={prefs.autoGainControl} onChange={(v) => setFlag('autoGainControl', v)} />
            </div>

            <p className="mt-3 flex items-start gap-2 rounded-xl bg-blue-500/10 p-3 text-xs text-blue-100">
              <Headphones className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Headphones give the clearest sound. If two people sit in the same room on the same call, they will always hear echo.
            </p>
            {notice && <p role="status" className="mt-3 text-xs text-amber-200">{notice}</p>}
          </div>
        )}
      </div>

      {poor && (
        <div role="alert" className="absolute inset-x-3 top-[calc(8rem+env(safe-area-inset-top))] z-30 mx-auto flex max-w-md flex-wrap items-center gap-2 rounded-2xl bg-amber-500/95 p-3 text-sm font-semibold text-slate-950 shadow-xl">
          <WifiOff className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">Your connection is very weak. Turn off video to keep voices clear.</span>
          {camOn && <button type="button" className="rounded-lg bg-slate-900 px-3 py-1.5 text-white" onClick={() => room.localParticipant.setCameraEnabled(false).catch(() => {})}>Camera off</button>}
          {!dataSaver && setDataSaver && <button type="button" className="rounded-lg bg-slate-900 px-3 py-1.5 text-white" onClick={() => setDataSaver(true)}>Save data</button>}
          <button type="button" aria-label="Dismiss" className="rounded-lg p-1" onClick={() => setBannerOff(true)}><X className="h-4 w-4" /></button>
        </div>
      )}
    </>
  );
}
