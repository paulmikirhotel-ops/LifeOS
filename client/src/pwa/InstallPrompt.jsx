import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, RefreshCw, X, Share } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { syncExisting } from '../push/pushClient.js';

const KEY = 'lifeos:install-dismissed';
const DAYS = 14;

const read = () => {
  try {
    const t = Number(localStorage.getItem(KEY) || 0);
    return Date.now() - t < DAYS * 86400000;
  } catch {
    return false;
  }
};
const write = () => {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
};

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

/** "Install the app" banner (Android/desktop Chrome and iPhone how-to) and a "new version" banner. Never shown inside meetings or calls. */
export default function InstallPrompt() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [deferred, setDeferred] = useState(null);
  const [dismissed, setDismissed] = useState(read);
  const [update, setUpdate] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onUpdate = (e) => setUpdate(e.detail || true);
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('pwa:update', onUpdate);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('pwa:update', onUpdate);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // After sign-in, reconnect this device's alerts if the person already allowed them.
  useEffect(() => {
    if (user?.id) syncExisting();
  }, [user?.id]);

  // Never interrupt a live meeting, call or the sign-in forms.
  const busy = /\/(room|live|call)(\/|$)|^\/meet\/|^\/(login|register|forgot-password|reset-password|verify-email|accept-invite|confirm-email-change|privacy|terms|help)/.test(pathname);
  if (busy) return null;

  const applyUpdate = () => {
    const waiting = update && update.waiting;
    if (waiting) {
      navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
      waiting.postMessage({ type: 'SKIP_WAITING' });
    } else window.location.reload();
  };

  const bar = 'fixed z-[60] left-3 right-3 sm:left-auto sm:right-4 sm:max-w-sm rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-3.5 flex items-center gap-3 text-sm';
  const style = { bottom: 'max(12px, env(safe-area-inset-bottom))' };

  if (update) {
    return (
      <div className={bar} style={style} role="status">
        <RefreshCw className="w-5 h-5 text-blue-600 shrink-0" aria-hidden="true" />
        <p className="flex-1 min-w-0 text-slate-700 dark:text-slate-200">A new version of LifeOS is ready.</p>
        <button onClick={applyUpdate} className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5">Refresh</button>
        <button onClick={() => setUpdate(null)} aria-label="Later" className="p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
      </div>
    );
  }

  if (dismissed || installed || isStandalone()) return null;
  const ios = isIos();
  if (!deferred && !ios) return null;

  const close = () => {
    write();
    setDismissed(true);
  };
  const install = async () => {
    try {
      deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    setDeferred(null);
    close();
  };

  return (
    <div className={bar} style={style} role="dialog" aria-label="Install LifeOS">
      {deferred ? <Download className="w-5 h-5 text-blue-600 shrink-0" aria-hidden="true" /> : <Share className="w-5 h-5 text-blue-600 shrink-0" aria-hidden="true" />}
      <p className="flex-1 min-w-0 text-slate-700 dark:text-slate-200">
        {deferred ? 'Install LifeOS on this device for quick access.' : 'To install: tap Share, then “Add to Home Screen”.'}
      </p>
      {deferred && <button onClick={install} className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5">Install</button>}
      <button onClick={close} aria-label="Dismiss" className="p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
    </div>
  );
}
