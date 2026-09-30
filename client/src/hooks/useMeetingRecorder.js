import { useCallback, useEffect, useRef, useState } from 'react';
import { meetingsApi } from '../api/meetings.js';
import { saveChunk, deleteChunk, listChunks } from '../utils/chunkStore.js';

/**
 * Reliable browser recording for long meetings.
 *
 *  - MediaRecorder emits a chunk every 10 s. A chunk is saved to IndexedDB, then uploaded and
 *    only deleted locally once the server confirms it. Nothing accumulates in memory, so a
 *    2-hour meeting (~30–60 MB) never lives in the browser as one big blob.
 *  - Uploads are sequential, retried with backoff and idempotent (the server de-duplicates by
 *    chunk index), so flaky mobile networks and API restarts don't lose or duplicate audio.
 *  - Unsent chunks survive a crash/reload and can be re-sent with recoverPending().
 *
 * Limitation: one continuous recording session per meeting. A page reload mid-meeting cannot
 * continue the same recording (a new session would produce a second audio file header).
 */

const TIMESLICE_MS = 10_000;
const AUDIO_BITS = 32_000; // mono speech; ≈ 29 MB per 2 h
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

// Errors that will never succeed on retry.
const PERMANENT = new Set([
  'CHUNK_TOO_LARGE',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RECORDING_TOO_LARGE',
  'STORAGE_NOT_CONFIGURED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'VALIDATION_ERROR',
  'BAD_REQUEST',
]);

export const MESSAGES = {
  micDenied: 'Microphone permission is required to record this meeting.',
  network: "Connection interrupted. We're attempting to preserve your recording.",
  stopped: 'Recording stopped unexpectedly. Please check your microphone and connection.',
  unsupported: 'This browser cannot record audio. Try the latest Chrome, Edge, Firefox or Safari.',
};

export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

export function micErrorMessage(err) {
  const n = err?.name;
  if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') return MESSAGES.micDenied;
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError') return 'No microphone was found. Connect one and try again.';
  if (n === 'NotReadableError' || n === 'TrackStartError') return 'The microphone is being used by another app. Close it and try again.';
  return 'Could not start recording. Please check your microphone and connection.';
}

export function useMeetingRecorder({ meetingId, startIndex = 0 }) {
  const [state, setState] = useState('idle'); // idle | requesting | recording | paused | stopping | stopped | error
  const [elapsedMs, setElapsedMs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState(null);
  const [netIssue, setNetIssue] = useState(false);
  const [pending, setPending] = useState(0);
  const [uploaded, setUploaded] = useState(0);
  const [stream, setStream] = useState(null);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const mimeRef = useRef('audio/webm');
  const indexRef = useRef(startIndex);
  const queueRef = useRef([]);
  const pumpingRef = useRef(false);
  const fatalRef = useRef(false);
  const stateRef = useRef('idle');
  const accRef = useRef(0); // ms recorded before the current run
  const runStartRef = useRef(null);
  const wakeRef = useRef(null);
  const stopResolveRef = useRef(null);

  const setS = (s) => {
    stateRef.current = s;
    setState(s);
  };

  const getElapsedMs = useCallback(
    () => accRef.current + (runStartRef.current ? Date.now() - runStartRef.current : 0),
    []
  );

  // ── upload pump ──────────────────────────────────────────────────────
  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    let delay = 2000;
    try {
      while (queueRef.current.length && !fatalRef.current) {
        const item = queueRef.current[0];
        try {
          await meetingsApi.putChunk(meetingId, item.index, item.blob, item.mime);
          queueRef.current.shift();
          deleteChunk(meetingId, item.index);
          setUploaded((n) => n + 1);
          setPending(queueRef.current.length);
          setNetIssue(false);
          delay = 2000;
        } catch (err) {
          const code = err && typeof err === 'object' ? err.code : undefined;
          if (code && PERMANENT.has(code)) {
            fatalRef.current = true;
            setError(err.message || MESSAGES.stopped);
            setNetIssue(false);
            break;
          }
          setNetIssue(true); // keep the audio, retry with backoff
          await new Promise((r) => setTimeout(r, delay));
          delay = Math.min(delay * 2, 30_000);
        }
      }
    } finally {
      pumpingRef.current = false;
      if (queueRef.current.length === 0) stopResolveRef.current?.();
    }
  }, [meetingId]);

  const enqueue = useCallback(
    (blob) => {
      const index = indexRef.current++;
      const item = { index, blob, mime: mimeRef.current };
      saveChunk(meetingId, index, blob, item.mime); // durable copy first
      queueRef.current.push(item);
      setPending(queueRef.current.length);
      pump();
    },
    [meetingId, pump]
  );

  /** Re-sends chunks left in IndexedDB by an earlier session of THIS meeting (same audio stream). */
  const recoverPending = useCallback(async () => {
    const rows = await listChunks(meetingId);
    if (!rows.length) return 0;
    const known = new Set(queueRef.current.map((q) => q.index));
    rows.forEach((r) => {
      if (!known.has(r.index)) queueRef.current.push({ index: r.index, blob: r.blob, mime: r.mime || 'audio/webm' });
    });
    queueRef.current.sort((a, b) => a.index - b.index);
    setPending(queueRef.current.length);
    pump();
    return rows.length;
  }, [meetingId, pump]);

  // ── wake lock (keeps mobile screens from sleeping mid-meeting) ───────
  const acquireWake = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && !wakeRef.current) {
        wakeRef.current = await navigator.wakeLock.request('screen');
        wakeRef.current.addEventListener('release', () => {
          wakeRef.current = null;
        });
      }
    } catch {
      /* best effort */
    }
  }, []);
  const releaseWake = useCallback(() => {
    wakeRef.current?.release?.().catch(() => {});
    wakeRef.current = null;
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && ['recording', 'paused'].includes(stateRef.current)) acquireWake();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [acquireWake]);

  // Warn before closing the tab while recording or while audio is still uploading.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (['recording', 'paused', 'stopping'].includes(stateRef.current) || queueRef.current.length) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Elapsed-time ticker (excludes paused time).
  useEffect(() => {
    if (state !== 'recording') return undefined;
    const id = setInterval(() => setElapsedMs(getElapsedMs()), 250);
    return () => clearInterval(id);
  }, [state, getElapsedMs]);

  const teardown = useCallback(() => {
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    } catch {
      /* already stopped */
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    releaseWake();
  }, [releaseWake]);

  useEffect(() => () => teardown(), [teardown]);

  // ── controls ─────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    setError(null);
    const mime = pickMimeType();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) {
      setError(MESSAGES.unsupported);
      setS('error');
      return false;
    }
    setS('requesting');
    let media;
    try {
      media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (err) {
      setError(micErrorMessage(err));
      setS('error');
      return false;
    }
    streamRef.current = media;
    setStream(media);
    mimeRef.current = (mime || 'audio/webm').split(';')[0];

    const recorder = new MediaRecorder(media, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: AUDIO_BITS });
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) enqueue(e.data);
    };
    recorder.onerror = () => {
      setError(MESSAGES.stopped);
      setS('error');
    };
    recorder.onstop = () => {
      if (stateRef.current === 'stopping') pump(); // flush the final chunk
    };
    // Unplugged/revoked microphone.
    media.getAudioTracks().forEach((t) =>
      t.addEventListener('ended', () => {
        if (['recording', 'paused'].includes(stateRef.current)) {
          setError(MESSAGES.stopped);
          setS('error');
        }
      })
    );

    accRef.current = 0;
    runStartRef.current = Date.now();
    recorder.start(TIMESLICE_MS);
    acquireWake();
    setS('recording');
    return true;
  }, [enqueue, pump, acquireWake]);

  const pause = useCallback(() => {
    if (stateRef.current !== 'recording') return;
    recorderRef.current?.pause();
    accRef.current = getElapsedMs();
    runStartRef.current = null;
    setElapsedMs(accRef.current);
    setS('paused');
  }, [getElapsedMs]);

  const resume = useCallback(() => {
    if (stateRef.current !== 'paused') return;
    recorderRef.current?.resume();
    runStartRef.current = Date.now();
    setS('recording');
  }, []);

  const toggleMute = useCallback(() => {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next; // a muted mic records silence, keeping the timeline intact
    });
    setMuted(next);
  }, [muted]);

  /**
   * Stops recording and waits (up to `waitMs`) for all audio to reach the server.
   * Returns what the server needs to finalise the recording.
   */
  const stop = useCallback(
    async ({ waitMs = 120_000 } = {}) => {
      if (!['recording', 'paused', 'error'].includes(stateRef.current)) return null;
      const durationSec = Math.round(getElapsedMs() / 1000);
      accRef.current = getElapsedMs();
      runStartRef.current = null;
      setS('stopping');
      const drained = new Promise((resolve) => {
        stopResolveRef.current = resolve;
      });
      teardown(); // stops the recorder → final dataavailable → onstop → pump
      // If nothing is queued the pump never runs; resolve on the next tick after the final chunk lands.
      setTimeout(() => {
        if (!queueRef.current.length && !pumpingRef.current) stopResolveRef.current?.();
      }, 1500);
      await Promise.race([drained, new Promise((r) => setTimeout(r, waitMs))]);
      stopResolveRef.current = null;
      setS('stopped');
      return {
        totalChunks: indexRef.current,
        durationSec,
        mimeType: mimeRef.current,
        pending: queueRef.current.length,
      };
    },
    [getElapsedMs, teardown]
  );

  return {
    state,
    elapsedMs,
    muted,
    error,
    netIssue,
    pending,
    uploaded,
    stream,
    mimeType: mimeRef.current,
    getElapsedMs,
    start,
    pause,
    resume,
    stop,
    toggleMute,
    recoverPending,
    clearError: () => setError(null),
  };
}
