import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_SECONDS = 300;
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
const extFor = (mime) => (mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm');

export const voiceSupported = () => typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

/** Records a voice note with the microphone. start() -> stop() gives a File (or null when cancelled). The caller should stop it at `maxSeconds` (5 minutes). */
export function useVoiceRecorder() {
  const [state, setState] = useState('idle'); // idle | recording
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const rec = useRef(null);
  const chunks = useRef([]);
  const stream = useRef(null);
  const timer = useRef(null);
  const resolver = useRef(null);

  const cleanup = useCallback(() => {
    clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    rec.current = null;
    setState('idle');
    setSeconds(0);
  }, []);

  const finish = useCallback((keep) => new Promise((resolve) => {
    const r = rec.current;
    if (!r || r.state === 'inactive') { cleanup(); resolve(null); return; }
    resolver.current = { resolve, keep };
    r.stop();
  }), [cleanup]);

  const start = useCallback(async () => {
    setError('');
    if (!voiceSupported()) { setError('Voice notes are not supported in this browser.'); return false; }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      setError(err?.name === 'NotAllowedError' ? 'Allow the microphone to record a voice note.' : 'No microphone was found.');
      return false;
    }
    const mime = TYPES.find((t) => window.MediaRecorder.isTypeSupported?.(t)) || '';
    const r = new window.MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
    chunks.current = [];
    r.ondataavailable = (e) => { if (e.data?.size) chunks.current.push(e.data); };
    r.onstop = () => {
      const type = r.mimeType || mime || 'audio/webm';
      const { resolve, keep } = resolver.current || {};
      const blob = new Blob(chunks.current, { type });
      cleanup();
      resolve?.(keep && blob.size > 0 ? new File([blob], `voice-note.${extFor(type)}`, { type }) : null);
    };
    rec.current = r;
    r.start(250);
    setState('recording');
    setSeconds(0);
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    return true;
  }, [cleanup]);

  useEffect(() => () => { clearInterval(timer.current); stream.current?.getTracks().forEach((t) => t.stop()); }, []);

  return { state, seconds, error, start, stop: () => finish(true), cancel: () => finish(false), maxSeconds: MAX_SECONDS };
}
