import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, RotateCcw, RotateCw, AlertTriangle } from 'lucide-react';
import { clock } from '../../utils/meetingFormat.js';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * Recording player. `audioRef` is owned by the parent so transcript lines can seek the audio
 * and the active line can follow playback.
 *
 * Browser recordings (WebM) often report an infinite duration until fully scanned; we fall back
 * to the duration stored with the meeting and use the well-known "seek far, then back" trick to
 * make the browser compute the real length.
 */
export default function AudioPlayer({ audioRef, src, durationHintSec, onTime, onExpired }) {
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationHintSec || 0);
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [error, setError] = useState(false);
  const fixingRef = useRef(false);

  useEffect(() => {
    setError(false);
    setCurrent(0);
    setPlaying(false);
  }, [src]);

  const a = () => audioRef.current;

  const onLoadedMetadata = () => {
    const el = a();
    if (!el) return;
    if (el.duration === Infinity || Number.isNaN(el.duration)) {
      fixingRef.current = true;
      el.currentTime = 1e101; // forces the browser to resolve the true duration
    } else {
      setDuration(el.duration);
    }
  };

  const onTimeUpdate = () => {
    const el = a();
    if (!el) return;
    if (fixingRef.current) {
      fixingRef.current = false;
      if (Number.isFinite(el.duration)) setDuration(el.duration);
      el.currentTime = 0;
      return;
    }
    setCurrent(el.currentTime);
    onTime?.(el.currentTime * 1000);
  };

  const toggle = async () => {
    const el = a();
    if (!el) return;
    try {
      if (el.paused) await el.play();
      else el.pause();
    } catch {
      setError(true);
    }
  };

  const seek = (sec) => {
    const el = a();
    if (!el) return;
    el.currentTime = Math.min(Math.max(0, sec), duration || sec);
    setCurrent(el.currentTime);
  };

  const setSpeed = (r) => {
    setRate(r);
    if (a()) a().playbackRate = r;
  };
  const setVol = (v) => {
    setVolume(v);
    if (a()) a().volume = v;
  };

  const pct = duration ? Math.min(100, (current / duration) * 100) : 0;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onDurationChange={() => Number.isFinite(a()?.duration) && setDuration(a().duration)}
        onTimeUpdate={onTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setError(true);
          onExpired?.(); // the signed URL may simply have expired — parent can fetch a fresh one
        }}
      />

      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4" aria-hidden="true" /> Playback failed. Refreshing the link…
        </p>
      )}

      <div>
        <input
          type="range"
          min={0}
          max={Math.max(1, duration)}
          step={0.1}
          value={Math.min(current, duration || current)}
          onChange={(e) => seek(parseFloat(e.target.value))}
          aria-label="Seek"
          aria-valuetext={`${clock(current * 1000)} of ${clock(duration * 1000)}`}
          className="w-full h-2 accent-indigo-600 cursor-pointer"
          style={{ background: `linear-gradient(to right, rgb(79 70 229) ${pct}%, rgb(226 232 240) ${pct}%)`, borderRadius: 9999 }}
        />
        <div className="mt-1 flex justify-between text-xs tabular-nums text-slate-500">
          <span>{clock(current * 1000)}</span>
          <span>{duration ? clock(duration * 1000) : '--:--'}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => seek(current - 15)} aria-label="Back 15 seconds" className="p-3 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"><RotateCcw className="w-5 h-5" /></button>
          <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="h-12 w-12 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow">
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>
          <button type="button" onClick={() => seek(current + 15)} aria-label="Forward 15 seconds" className="p-3 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"><RotateCw className="w-5 h-5" /></button>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-500">
          Speed
          <select value={rate} onChange={(e) => setSpeed(parseFloat(e.target.value))} aria-label="Playback speed" className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm dark:text-white min-h-[40px]">
            {SPEEDS.map((s) => <option key={s} value={s}>{s}x</option>)}
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-slate-500">
          {volume === 0 ? <VolumeX className="w-4 h-4" aria-hidden="true" /> : <Volume2 className="w-4 h-4" aria-hidden="true" />}
          <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVol(parseFloat(e.target.value))} aria-label="Volume" className="w-24 accent-indigo-600" />
        </label>
      </div>
    </div>
  );
}
