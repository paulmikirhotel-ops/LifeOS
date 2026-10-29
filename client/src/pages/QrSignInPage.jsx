import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { QrCode, RefreshCw, Smartphone } from 'lucide-react';
import { deviceLinkApi } from '../api/deviceLink.js';
import { clock } from '../utils/deviceLink.js';
import { formatApiError } from '../utils/errors.js';
import { Button, Spinner } from '../components/ui.jsx';

const POLL_MS = 2000;

/**
 * /login/qr  - the computer shows a code. A phone that is already signed in (the LifeOS app, or LifeOS in the phone's browser)
 * scans it or types the short code, and taps Allow. This page notices and signs the computer in.
 */
export default function QrSignInPage() {
  const [phase, setPhase] = useState('loading'); // loading | ready | denied | expired | error | signing
  const [info, setInfo] = useState(null);
  const [image, setImage] = useState('');
  const [left, setLeft] = useState(0);
  const [message, setMessage] = useState('');
  const run = useRef(0); // each new code gets a number, so answers for an old code are ignored

  const begin = useCallback(async () => {
    const id = ++run.current;
    setPhase('loading'); setMessage(''); setImage('');
    try {
      const d = await deviceLinkApi.start();
      if (id !== run.current) return;
      if (!d || typeof d.code !== 'string' || typeof d.secret !== 'string' || typeof d.pairCode !== 'string') throw new Error('Unexpected answer from the server.');
      const QR = (await import('qrcode')).default;
      const url = `${window.location.origin}/link/${d.code}`;
      const png = await QR.toDataURL(url, { margin: 1, width: 280, errorCorrectionLevel: 'M' });
      if (id !== run.current) return;
      setInfo({ code: d.code, secret: d.secret, pairCode: d.pairCode, endsAt: Date.now() + (d.ttlMs || 120000) });
      setImage(png);
      setLeft(Math.round((d.ttlMs || 120000) / 1000));
      setPhase('ready');
    } catch (e) {
      if (id !== run.current) return;
      setMessage(e?.response ? formatApiError(e) : String(e?.message || e));
      setPhase('error');
    }
  }, []);

  useEffect(() => { begin(); return () => { run.current += 1; }; }, [begin]);

  // countdown shown to the person (the server decides when a code is really old)
  useEffect(() => {
    if (phase !== 'ready' || !info) return undefined;
    const t = setInterval(() => setLeft(Math.max(0, Math.round((info.endsAt - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  }, [phase, info]);

  // ask every 2 seconds: did the phone say yes?
  useEffect(() => {
    if (phase !== 'ready' || !info) return undefined;
    let stopped = false;
    let timer;
    const id = run.current;
    const tick = async () => {
      if (stopped) return;
      try {
        const r = await deviceLinkApi.status(info.code, info.secret);
        if (stopped || id !== run.current) return;
        if (r?.status === 'approved') {
          setPhase('signing');
          // The sign-in cookies were set by that answer. A fresh load of the app picks them up.
          window.location.replace('/');
          return;
        }
        if (r?.status === 'denied') { setPhase('denied'); return; }
        if (r?.status === 'expired' || r?.status === 'used') { setPhase('expired'); return; }
      } catch (e) {
        if (e?.response?.status === 429) { /* too many checks: just wait for the next round */ }
      }
      timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => { stopped = true; clearTimeout(timer); };
  }, [phase, info]);

  useEffect(() => {
    if (phase === 'ready' && left === 0 && info && Date.now() >= info.endsAt) setPhase('expired');
  }, [phase, left, info]);

  return (
    <div className="w-full max-w-md mx-auto space-y-5 text-center">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Sign in with your phone</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">No password needed on this computer. Your phone must already be signed in to LifeOS.</p>
      </header>

      {phase === 'loading' && <div className="flex justify-center py-10"><Spinner /></div>}

      {phase === 'ready' && info && (
        <div className="space-y-4">
          <div className="mx-auto w-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700">
            <img src={image} alt="Sign-in QR code" width="280" height="280" className="h-auto w-[280px] max-w-full" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Check this matches on your phone</p>
            <p className="mt-1 font-mono text-3xl font-bold tracking-widest text-slate-900 dark:text-slate-100" aria-label={`Pair code ${info.pairCode.split('').join(' ')}`}>{info.pairCode}</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">This code works for <span className="font-semibold tabular-nums">{clock(left)}</span></p>
          </div>
          <ol className="mx-auto max-w-xs space-y-1.5 text-left text-sm text-slate-700 dark:text-slate-300">
            <li className="flex gap-2"><Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" /><span>On your phone open LifeOS and go to <strong>Link a device</strong>.</span></li>
            <li className="flex gap-2"><QrCode className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" /><span>Scan this code, or type the letters above.</span></li>
            <li className="flex gap-2"><span aria-hidden="true" className="mt-0.5 inline-block h-4 w-4 shrink-0 text-center text-xs font-bold text-indigo-600">3</span><span>Tap <strong>Allow</strong>. This page signs in by itself.</span></li>
          </ol>
        </div>
      )}

      {phase === 'signing' && <div className="flex flex-col items-center gap-2 py-8"><Spinner /><p className="text-sm text-slate-700 dark:text-slate-300">Approved. Signing you in…</p></div>}

      {phase === 'expired' && (
        <div className="space-y-3 py-4">
          <p className="text-slate-800 dark:text-slate-200">This code is no longer valid.</p>
          <Button onClick={begin} icon={RefreshCw}>Show a new code</Button>
        </div>
      )}

      {phase === 'denied' && (
        <div className="space-y-3 py-4">
          <p className="text-slate-800 dark:text-slate-200">The sign-in was declined on your phone.</p>
          <Button onClick={begin} icon={RefreshCw}>Try again</Button>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-3 py-4">
          <p role="alert" className="text-red-700 dark:text-red-300">{message || 'Something went wrong.'}</p>
          <Button onClick={begin} icon={RefreshCw}>Try again</Button>
        </div>
      )}

      <p className="text-sm"><Link to="/login" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">Use email and password instead</Link></p>
    </div>
  );
}
