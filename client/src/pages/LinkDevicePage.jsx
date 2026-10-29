import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, Laptop, ShieldAlert, Smartphone, Trash2, Check, X } from 'lucide-react';
import { deviceLinkApi } from '../api/deviceLink.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { agoText, cleanPairInput, clock, formatPairTyping, isExpiredLink, isUnverified, parseLinkCode } from '../utils/deviceLink.js';
import { formatApiError } from '../utils/errors.js';
import { Badge, Button, Card, Input, Spinner } from '../components/ui.jsx';

/**
 * /link and /link/:code  - for a phone that is already signed in.
 * Scan the code shown on a computer (or type its short code), check it is the computer in front of you, then Allow or Deny.
 * Below: every device signed in to this account, with a Sign out button for each.
 */
export default function LinkDevicePage() {
  const { code: urlCode } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { addToast } = useToast();
  const unverified = user && user.isEmailVerified === false;

  const [mode, setMode] = useState('home'); // home | scan | looking | confirm | done
  const [target, setTarget] = useState(null); // { code | ref, pairCode, device, endsAt }
  const [left, setLeft] = useState(0);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [doneText, setDoneText] = useState('');
  const [devices, setDevices] = useState(null);
  const [devError, setDevError] = useState('');

  const showProblem = useCallback((e) => {
    if (isUnverified(e)) return setError('Please verify your email address first. Only verified accounts can sign in another device.');
    if (isExpiredLink(e)) return setError('That code is old or was already used. Ask the computer to show a new one.');
    return setError(e?.response ? formatApiError(e) : String(e?.message || e));
  }, []);

  const loadDevices = useCallback(async () => {
    try {
      setDevError('');
      const d = await deviceLinkApi.devices();
      if (!d || !Array.isArray(d.items)) throw new Error('Unexpected answer from the server.');
      setDevices(d.items);
    } catch (e) { setDevError(e?.response ? formatApiError(e) : String(e?.message || e)); }
  }, []);
  useEffect(() => { loadDevices(); }, [loadDevices]);

  const open = useCallback(async (code) => {
    setError(''); setMode('looking');
    try {
      const d = await deviceLinkApi.peek(code);
      setTarget({ code, pairCode: d.pairCode, device: d.device, endsAt: Date.now() + (d.secondsLeft || 0) * 1000 });
      setMode('confirm');
    } catch (e) { showProblem(e); setMode('home'); }
  }, [showProblem]);

  // Opened from the phone's own camera or a link: /link/<code>
  useEffect(() => { if (urlCode) { const c = parseLinkCode(urlCode); if (c) open(c); else setError('That link is not a valid LifeOS code.'); } }, [urlCode, open]);

  const typedPair = cleanPairInput(typed);
  const lookup = async (e) => {
    e.preventDefault();
    if (!typedPair) return;
    setError(''); setBusy(true);
    try {
      const d = await deviceLinkApi.lookup(typedPair);
      setTarget({ ref: d.ref, pairCode: d.pairCode, device: d.device, endsAt: Date.now() + (d.secondsLeft || 0) * 1000 });
      setLeft(d.secondsLeft || 0);
      setMode('confirm'); setTyped('');
    } catch (err) { showProblem(err); } finally { setBusy(false); }
  };

  useEffect(() => {
    if (mode !== 'confirm' || !target) return undefined;
    const tick = () => setLeft(Math.max(0, Math.round((target.endsAt - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [mode, target]);

  const pick = target?.code ? { code: target.code } : { ref: target?.ref };
  const decide = async (allow) => {
    setBusy(true); setError('');
    try {
      if (allow) { await deviceLinkApi.approve(pick); setDoneText(`${target.device?.label || 'The computer'} is being signed in.`); } else { await deviceLinkApi.deny(pick); setDoneText('Declined. Nothing was signed in.'); }
      setMode('done'); setTarget(null);
      if (urlCode) navigate('/link', { replace: true });
      loadDevices();
    } catch (e) { showProblem(e); setMode('home'); setTarget(null); } finally { setBusy(false); }
  };

  const signOutDevice = async (d) => {
    setBusy(true);
    try {
      if (d.current) { await logout(); return; }
      await deviceLinkApi.removeDevice(d.id);
      addToast('Device signed out');
      await loadDevices();
    } catch (e) { addToast(formatApiError(e)); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Link a device</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">Sign in on a computer without typing your password: scan the code it shows, then tap Allow.</p>
      </header>

      {unverified && (
        <Card className="flex gap-3 p-4 text-sm text-amber-800 dark:text-amber-200">
          <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
          <p>Your email address is not verified yet, so you cannot allow other devices to sign in. Verify your email first.</p>
        </Card>
      )}

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}

      {mode === 'looking' && <div className="flex justify-center py-6"><Spinner /></div>}

      {(mode === 'home' || mode === 'done') && (
        <Card className="space-y-4 p-4">
          {mode === 'done' && <p role="status" className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><Check className="h-5 w-5" aria-hidden="true" />{doneText}</p>}
          <Button onClick={() => { setError(''); setMode('scan'); }} icon={Camera} disabled={Boolean(unverified)}>Scan a code</Button>
          <form onSubmit={lookup} className="space-y-2">
            <Input label="Or type the code shown on the computer" value={typed} onChange={(e) => setTyped(formatPairTyping(e.target.value))} placeholder="K7M2-9QXF" autoComplete="off" autoCapitalize="characters" spellCheck={false} inputMode="text" className="font-mono tracking-widest" />
            <Button type="submit" variant="secondary" loading={busy} disabled={!typedPair || Boolean(unverified)}>Find the computer</Button>
          </form>
          <p className="text-xs text-slate-500 dark:text-slate-400">On the computer open LifeOS and choose <strong>Sign in with QR code</strong> on the sign-in page.</p>
        </Card>
      )}

      {mode === 'scan' && <Scanner onCode={(c) => open(c)} onCancel={() => setMode('home')} onProblem={(m) => { setError(m); setMode('home'); }} />}

      {mode === 'confirm' && target && (
        <Card className="space-y-4 p-4">
          <div className="flex items-start gap-3">
            <Laptop className="mt-1 h-6 w-6 shrink-0 text-indigo-600" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{target.device?.label || 'A device'} wants to sign in</p>
              {target.device?.ip ? <p className="text-sm text-slate-600 dark:text-slate-400">Network address {target.device.ip}</p> : null}
              <p className="mt-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Code on that screen</p>
              <p className="font-mono text-2xl font-bold tracking-widest text-slate-900 dark:text-slate-100">{target.pairCode}</p>
            </div>
          </div>
          <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"><ShieldAlert className="h-5 w-5 shrink-0" aria-hidden="true" /><span>Only allow this if you opened this code <strong>on your own computer just now</strong> and the letters above match what it shows. If someone sent you this code, tap Deny.</span></p>
          <p className="text-sm text-slate-600 dark:text-slate-400">Time left: <span className="font-semibold tabular-nums">{clock(left)}</span></p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => decide(true)} loading={busy} icon={Check} disabled={left === 0}>Allow</Button>
            <Button variant="secondary" onClick={() => decide(false)} disabled={busy} icon={X}>Deny</Button>
          </div>
        </Card>
      )}

      <section aria-labelledby="devices-title" className="space-y-3">
        <h2 id="devices-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">Devices signed in to your account</h2>
        {devError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{devError} <Button size="sm" variant="secondary" onClick={loadDevices}>Try again</Button></p>}
        {!devices && !devError && <div className="flex justify-center py-4"><Spinner /></div>}
        {devices && devices.length === 0 && <p className="text-sm text-slate-600 dark:text-slate-400">No other devices are listed. Your own sign-in may be from before this feature; it will appear here after your next sign-in.</p>}
        {devices && devices.length > 0 && (
          <ul className="space-y-2">
            {devices.map((d) => {
              const Icon = d.kind === 'app' ? Smartphone : Laptop;
              return (
                <li key={d.id}>
                  <Card className="flex items-center gap-3 p-3">
                    <Icon className="h-6 w-6 shrink-0 text-slate-500" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900 dark:text-slate-100"><span className="truncate">{d.label}</span>{d.current ? <Badge>This device</Badge> : null}{d.via === 'qr' ? <Badge>Signed in with QR</Badge> : null}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">Last used {agoText(d.lastUsedAt)}{d.ip ? ` · ${d.ip}` : ''}</p>
                    </div>
                    <Button size="sm" variant="secondary" icon={Trash2} onClick={() => signOutDevice(d)} disabled={busy} aria-label={`Sign out ${d.label}`}>{d.current ? 'Sign out' : 'Remove'}</Button>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">A removed device is signed out right away for new requests; a page it already has open can keep working for up to 15 minutes. If you do not recognise a device, remove it and change your password.</p>
      </section>
    </div>
  );
}

/** Camera scanner. Uses the browser's own QR reader when it has one, and the jsQR library otherwise. */
function Scanner({ onCode, onCancel, onProblem }) {
  const video = useRef(null);
  useEffect(() => {
    let stopped = false;
    let stream;
    let raf = 0;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use the camera. Type the code instead.');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current;
        v.srcObject = stream; v.setAttribute('playsinline', 'true');
        await v.play();
        const detector = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
        const jsQR = detector ? null : (await import('jsqr')).default;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        let last = 0;
        const loop = async (t) => {
          if (stopped) return;
          raf = requestAnimationFrame(loop);
          if (t - last < 200 || v.readyState < 2 || !v.videoWidth) return;
          last = t;
          let text = '';
          try {
            if (detector) { const r = await detector.detect(v); text = r[0]?.rawValue || ''; } else {
              canvas.width = v.videoWidth; canvas.height = v.videoHeight;
              ctx.drawImage(v, 0, 0);
              text = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data || '';
            }
          } catch { return; }
          const code = parseLinkCode(text);
          if (code && !stopped) { stopped = true; cancelAnimationFrame(raf); stream.getTracks().forEach((x) => x.stop()); onCode(code); }
        };
        raf = requestAnimationFrame(loop);
      } catch (e) {
        if (!stopped) onProblem(e?.name === 'NotAllowedError' ? 'Camera permission was refused. Allow the camera, or type the code instead.' : String(e?.message || 'The camera could not start. Type the code instead.'));
      }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Card className="space-y-3 p-4">
      <div className="overflow-hidden rounded-xl bg-black"><video ref={video} muted playsInline className="aspect-square w-full object-cover" /></div>
      <p className="text-sm text-slate-600 dark:text-slate-400">Point the camera at the code on the computer screen.</p>
      <Button variant="secondary" onClick={onCancel}>Cancel</Button>
    </Card>
  );
}
