import { useEffect, useRef, useState } from 'react';
import { meetingsApi } from '../api/meetings.js';

/**
 * Near-live transcript. While recording, a SECOND MediaRecorder on the same microphone stream
 * produces short, self-contained clips (a continuous recorder's later chunks cannot be decoded
 * alone). Each clip is transcribed on the server. The archive recording is unaffected: a failed
 * or slow clip only means that stretch is filled in later by the post-meeting pass.
 */

const CLIP_MS = 15_000;

export function useLiveTranscription({ meetingId, stream, mimeType, active, enabled, getElapsedMs, onSegments }) {
  const [status, setStatus] = useState('idle'); // idle | listening | paused | unavailable | error
  const [note, setNote] = useState(null);
  const onSegRef = useRef(onSegments);
  onSegRef.current = onSegments;
  const inflight = useRef(0);

  useEffect(() => {
    if (!enabled || !stream || typeof MediaRecorder === 'undefined') return undefined;
    if (!active) {
      setStatus('paused');
      return undefined;
    }
    let cancelled = false;
    let timer = null;
    let recorder = null;
    setStatus('listening');
    setNote(null);

    const mime = mimeType || 'audio/webm';
    const supported = MediaRecorder.isTypeSupported(mime) ? mime : undefined;

    const send = async (blob, offsetMs) => {
      if (cancelled || blob.size < 1200) return; // ignore near-empty clips
      if (inflight.current >= 3) return; // never build a backlog
      inflight.current += 1;
      try {
        const res = await meetingsApi.transcribeChunk(meetingId, blob, mime, offsetMs);
        if (res?.data?.segments?.length) onSegRef.current?.(res.data.segments);
        setStatus('listening');
        setNote(null);
      } catch (err) {
        if (err?.code === 'STT_NOT_CONFIGURED') {
          cancelled = true;
          setStatus('unavailable');
          setNote('Live transcription is not set up on the server. The recording is still being saved.');
        } else {
          setStatus('error');
          setNote('Live transcription is catching up — the recording is unaffected.');
        }
      } finally {
        inflight.current -= 1;
      }
    };

    const cycle = () => {
      if (cancelled) return;
      const chunks = [];
      const offsetMs = Math.max(0, Math.round(getElapsedMs()));
      try {
        recorder = new MediaRecorder(stream, { ...(supported ? { mimeType: supported } : {}), audioBitsPerSecond: 32_000 });
      } catch {
        setStatus('unavailable');
        return;
      }
      recorder.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
      recorder.onstop = () => {
        send(new Blob(chunks, { type: mime }), offsetMs);
        if (!cancelled) cycle();
      };
      recorder.start();
      timer = setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), CLIP_MS);
    };
    cycle();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      try {
        if (recorder && recorder.state !== 'inactive') {
          recorder.onstop = null;
          recorder.stop();
        }
      } catch {
        /* already stopped */
      }
    };
  }, [enabled, stream, active, meetingId, mimeType, getElapsedMs]);

  return { status, note };
}
