import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Link2, Share2, KeyRound, RefreshCw, Eye, EyeOff, Users, Check, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Button, Card, Select, Spinner, Modal } from '../ui.jsx';
import { meetingsApi } from '../../api/meetings.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';
import { publicOrigin, isLocalOnlyOrigin } from '../../utils/publicUrl.js';

const MODES = [
  { value: 'link', label: 'Anyone with the link + password' },
  { value: 'authenticated', label: 'LifeOS account holders only' },
  { value: 'restricted', label: 'Invited participants only' },
];

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older mobile browsers / non-secure contexts
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/**
 * Organizer panel: the meeting's invitation link, its password and who joined through it.
 * The password is only known right after it is created/changed (the server stores a hash), so it is
 * held in component state — never in storage — and "Change password" is offered when it is gone.
 */
export default function InviteLinkCard({ meeting, initialInvite }) {
  const { addToast } = useToast();
  const id = meeting.id;
  const [invite, setInvite] = useState(initialInvite || null);
  const [password, setPassword] = useState(initialInvite?.password || null);
  const [loading, setLoading] = useState(!initialInvite);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [copied, setCopied] = useState('');
  const [joiners, setJoiners] = useState(null);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [customPw, setCustomPw] = useState('');
  const [pwOpen, setPwOpen] = useState(false);

  const apply = useCallback((data) => {
    setInvite(data);
    if (data.password) setPassword(data.password);
  }, []);

  const loadJoiners = useCallback(() => meetingsApi.inviteParticipants(id).then((r) => setJoiners(r.data)).catch(() => setJoiners({ items: [], total: 0 })), [id]);

  useEffect(() => {
    let alive = true;
    setError(null);
    meetingsApi.getInvite(id)
      .then((r) => { if (alive) { apply(r.data); setLoading(false); } })
      .catch((e) => { if (alive) { setError(formatApiError(e)); setLoading(false); } });
    loadJoiners();
    return () => { alive = false; };
  }, [id, apply, loadJoiners]);

  if (loading) return <Card className="p-5 flex items-center gap-3 text-sm text-slate-500"><Spinner /> Preparing meeting link…</Card>;
  if (error || !invite) return <Card className="p-5 text-sm text-red-600" role="alert">{error || 'Could not load the meeting link.'}</Card>;

  const url = `${publicOrigin()}${invite.path}`;
  const localOnly = isLocalOnlyOrigin();
  const flash = (what) => { setCopied(what); setTimeout(() => setCopied(''), 1800); };
  const copy = async (what, text, msg) => { (await copyText(text)) ? (flash(what), addToast(msg)) : addToast('Could not copy — select and copy it manually', 'error'); };

  const when = `${format(new Date(meeting.startAt), 'EEE, MMM d · h:mm a')}`;
  const message = [
    `You're invited: ${meeting.title}`,
    when,
    '',
    `Join link: ${url}`,
    invite.accessMode === 'link' || invite.accessMode === 'authenticated' ? (password ? `Password: ${password}` : '') : '',
  ].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n').trim();

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: meeting.title, text: message }); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const act = async (fn, ok) => {
    setBusy(true);
    try { const r = await fn(); apply(r.data); if (ok) addToast(ok); } catch (e) { addToast(formatApiError(e), 'error'); } finally { setBusy(false); }
  };

  const savePassword = async () => {
    await act(() => meetingsApi.updateInvite(id, customPw ? { password: customPw } : { regeneratePassword: true }), 'Password updated');
    setCustomPw(''); setPwOpen(false); setShowPw(true);
  };

  const regenerate = async () => {
    setConfirmRegen(false);
    await act(() => meetingsApi.regenerateInvite(id), 'New link created — the old link no longer works');
    setShowPw(true);
  };

  return (
    <Card className="p-4 sm:p-5 space-y-4 min-w-0 max-w-full">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900 dark:text-white"><Link2 className="w-5 h-5 text-indigo-500" aria-hidden="true" /> Meeting invitation link</h2>
          <p className="text-xs text-slate-500 mt-0.5">Send it to a WhatsApp group, email or SMS. People enter the password to join.</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 shrink-0 min-h-[44px]">
          <input type="checkbox" className="w-5 h-5 accent-indigo-600" checked={invite.enabled} disabled={busy}
            onChange={(e) => act(() => meetingsApi.updateInvite(id, { enabled: e.target.checked }), e.target.checked ? 'Link turned on' : 'Link turned off')} />
          Link on
        </label>
      </div>

      <div>
        {localOnly && (
          <p role="alert" className="mb-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/30">
            This link starts with <b>{new URL(url).host}</b>, so it only works on this computer. To invite someone on another device, open LifeOS using this computer's network address (the "Network" line shown when you start the client) or set <code>VITE_PUBLIC_URL</code>.
          </p>
        )}
        <label htmlFor="invite-url" className="sr-only">Meeting invitation link</label>
        <input id="invite-url" readOnly value={url} onFocus={(e) => e.target.select()}
          className={`w-full min-w-0 min-h-[44px] rounded-xl border px-3 text-sm font-mono text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 ${invite.enabled ? '' : 'opacity-50 line-through'}`} />
        <div className="mt-2 grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          <Button icon={copied === 'link' ? Check : Copy} onClick={() => copy('link', url, 'Link copied')} className="min-h-[44px]">{copied === 'link' ? 'Copied' : 'Copy Link'}</Button>
          <Button variant="secondary" icon={Share2} onClick={share} className="min-h-[44px]">Share Meeting</Button>
          <Button variant="secondary" icon={MessageCircle} onClick={() => copy('msg', message, 'Invitation message copied')} className="min-h-[44px] col-span-2 sm:col-span-1">{copied === 'msg' ? 'Copied' : 'Copy invitation message'}</Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100"><KeyRound className="w-4 h-4 text-indigo-500" aria-hidden="true" /> Meeting password</p>
          <Button size="sm" variant="ghost" onClick={() => setPwOpen(true)} className="min-h-[40px]">Change</Button>
        </div>
        {password ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-base font-bold tracking-widest text-slate-900 dark:text-white" aria-live="polite">{showPw ? password : '•'.repeat(password.length)}</code>
            <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw} className="w-11 h-11 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500">{showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
            <button type="button" onClick={() => copy('pw', password, 'Password copied')} aria-label="Copy password" className="w-11 h-11 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500">{copied === 'pw' ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}</button>
          </div>
        ) : (
          <p className="text-xs text-slate-500">For security the password is only shown when it is created. Use <strong>Change</strong> to set or generate a new one to share.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select label="Who can join" value={invite.accessMode} disabled={busy} options={MODES}
          onChange={(e) => act(() => meetingsApi.updateInvite(id, { accessMode: e.target.value }), 'Access updated')} />
        <div className="flex items-end">
          <Button variant="secondary" icon={RefreshCw} onClick={() => setConfirmRegen(true)} disabled={busy} className="w-full min-h-[44px]">Regenerate link</Button>
        </div>
      </div>
      {invite.locked && <p className="text-xs text-amber-600" role="status">Too many wrong passwords were entered, so the link is paused for a few minutes. Changing the password unlocks it.</p>}

      <label className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3 min-h-[44px] cursor-pointer">
        <input type="checkbox" className="w-5 h-5 mt-0.5 accent-indigo-600" checked={invite.allowRecording !== false} disabled={busy}
          onChange={(e) => act(() => meetingsApi.updateInvite(id, { allowRecording: e.target.checked }), e.target.checked ? 'Participants can record' : 'Only you can record')} />
        <span className="text-sm"><b className="text-slate-800 dark:text-slate-100">Let participants record the meeting</b><span className="block text-xs text-slate-500">One person records at a time. If they leave, someone else can continue. The recording, transcript and summary are always saved to you. Turn off so only you can record.</span></span>
      </label>

      <label className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3 min-h-[44px] cursor-pointer">
        <input type="checkbox" className="w-5 h-5 mt-0.5 accent-indigo-600" checked={invite.shareMinutes !== false} disabled={busy}
          onChange={(e) => act(() => meetingsApi.updateInvite(id, { shareMinutes: e.target.checked }), e.target.checked ? 'Minutes will be shared with people who joined' : 'Minutes stay private to you')} />
        <span className="text-sm"><b className="text-slate-800 dark:text-slate-100">Share the minutes with people who joined</b><span className="block text-xs text-slate-500">After the meeting they get a read-only summary, minutes and action items (never the recording). Everything stays in your account. Guests who add an e-mail get it by e-mail.</span></span>
      </label>

      <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
        <p className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100"><Users className="w-4 h-4 text-indigo-500" aria-hidden="true" /> Joined through the link{joiners ? ` (${joiners.total})` : ''}</p>
        {!joiners ? <Spinner size="sm" className="mt-2" /> : joiners.items.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">Nobody yet. People appear here as soon as they enter the password.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
            {joiners.items.slice(0, 20).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 truncate text-slate-800 dark:text-slate-100">{p.name}{p.isGuest && <span className="ml-1.5 text-[11px] font-semibold text-slate-400">guest</span>}</span>
                <span className="text-xs text-slate-400 shrink-0">{format(new Date(p.registeredAt), 'MMM d, h:mm a')}</span>
              </li>
            ))}
          </ul>
        )}
        {joiners?.total > 20 && <p className="mt-1 text-xs text-slate-400">Showing the first 20 of {joiners.total}.</p>}
      </div>

      <Modal isOpen={confirmRegen} onClose={() => setConfirmRegen(false)} title="Regenerate meeting link?">
        <p className="text-sm text-slate-600 dark:text-slate-300">A new link and password will be created. The old link stops working immediately and anyone who joined with it must use the new one.</p>
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmRegen(false)} className="min-h-[44px]">Cancel</Button>
          <Button onClick={regenerate} className="min-h-[44px]">Regenerate</Button>
        </div>
      </Modal>

      <Modal isOpen={pwOpen} onClose={() => setPwOpen(false)} title="Change meeting password">
        <label htmlFor="new-pw" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">New password (min 6 characters)</label>
        <input id="new-pw" value={customPw} onChange={(e) => setCustomPw(e.target.value)} maxLength={64} autoComplete="off" placeholder="Leave empty to generate one"
          className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white" />
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="secondary" onClick={() => setPwOpen(false)} className="min-h-[44px]">Cancel</Button>
          <Button onClick={savePassword} loading={busy} disabled={customPw.length > 0 && customPw.length < 6} className="min-h-[44px]">{customPw ? 'Save password' : 'Generate new password'}</Button>
        </div>
      </Modal>
    </Card>
  );
}
