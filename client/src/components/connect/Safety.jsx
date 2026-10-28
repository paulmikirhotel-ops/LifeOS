import React, { useEffect, useRef, useState } from 'react';
import { MoreVertical, Ban, Flag, ShieldCheck, Loader2, BellOff, Bell, Archive, ArchiveRestore, Images } from 'lucide-react';
import { Button, Card, ConfirmDialog, Modal } from '../ui.jsx';
import { connectApi } from '../../api/connect.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useConnect } from '../../context/ConnectContext.jsx';
import { formatApiError } from '../../utils/errors.js';

const REASONS = [
  ['spam', 'Spam or unwanted messages'],
  ['harassment', 'Harassment or bullying'],
  ['inappropriate', 'Inappropriate or harmful content'],
  ['impersonation', 'Pretending to be someone else'],
  ['other', 'Something else'],
];

/** Report a person (or one of their messages). Goes to the LifeOS team; the other person is not told. */
export function ReportModal({ target, onClose }) {
  const { addToast } = useToast();
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setReason('spam'); setDetails(''); }, [target]);
  const send = async () => {
    setBusy(true);
    try {
      await connectApi.report({ userId: target.userId, ...(target.messageId ? { messageId: target.messageId } : {}), reason, ...(details.trim() ? { details: details.trim() } : {}) });
      addToast('Thank you. Your report was sent.');
      onClose();
    } catch (err) { addToast(formatApiError(err), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen={Boolean(target)} onClose={() => !busy && onClose()} title={target?.messageId ? 'Report this message' : `Report ${target?.name || ''}`}>
      <div className="space-y-4">
        <fieldset className="space-y-1">
          <legend className="mb-1 text-sm font-semibold text-slate-900 dark:text-white">What is the problem?</legend>
          {REASONS.map(([v, label]) => (
            <label key={v} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-3 hover:bg-slate-50 dark:hover:bg-slate-800">
              <input type="radio" name="report-reason" value={v} checked={reason === v} onChange={() => setReason(v)} className="h-4 w-4 accent-blue-600" />
              <span className="text-sm text-slate-800 dark:text-slate-200">{label}</span>
            </label>
          ))}
        </fieldset>
        <div>
          <label htmlFor="report-details" className="mb-1 block text-sm font-semibold text-slate-900 dark:text-white">More details (optional)</label>
          <textarea id="report-details" value={details} maxLength={500} onChange={(e) => setDetails(e.target.value)} rows={3} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
        </div>
        <p className="text-xs text-slate-500">Only the message you chose and your answers are sent. The other person will not be told who reported them.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button className="!bg-blue-600 hover:!bg-blue-700 !text-white" loading={busy} onClick={send}>Send report</Button>
        </div>
      </div>
    </Modal>
  );
}

/** The "⋮" menu in a private chat header: block or report the other person. Not shown in groups. */
export function SafetyMenu({ conversation, onBlocked, onPrefs, onMedia }) {
  const { addToast } = useToast();
  const { refreshAll } = useConnect();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (!conversation) return null;
  const direct = Boolean(conversation.userId) && !conversation.group;
  const item = 'flex w-full items-center gap-2 px-3 py-3 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700';
  const block = async () => {
    setBusy(true);
    try { await connectApi.block(conversation.userId); setConfirm(false); addToast(`${conversation.name} was blocked`); await refreshAll(); onBlocked?.(); } catch (err) { addToast(formatApiError(err), 'error'); } finally { setBusy(false); }
  };
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="More options" aria-expanded={open} className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:text-slate-300 dark:hover:bg-slate-800"><MoreVertical className="h-5 w-5" /></button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-30 w-52 overflow-hidden rounded-xl bg-white text-slate-800 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700">
          {onMedia && <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); onMedia(); }}><Images className="h-4 w-4" />Media &amp; files</button>}
          {onPrefs && <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); onPrefs({ muted: !conversation.muted }); }}>{conversation.muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}{conversation.muted ? 'Unmute' : 'Mute'}</button>}
          {onPrefs && <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); onPrefs({ archived: !conversation.archived }); }}>{conversation.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}{conversation.archived ? 'Unarchive' : 'Archive'}</button>}
          {direct && <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); setReport({ userId: conversation.userId, name: conversation.name }); }}><Flag className="h-4 w-4" />Report {conversation.name.split(' ')[0]}</button>}
          {direct && <button role="menuitem" type="button" className={`${item} text-red-600`} onClick={() => { setOpen(false); setConfirm(true); }}><Ban className="h-4 w-4" />Block {conversation.name.split(' ')[0]}</button>}
        </div>
      )}
      <ConfirmDialog open={confirm} danger busy={busy} title={`Block ${conversation.name}?`} description="You will stop being friends. They cannot message or call you, and neither of you can find or add the other. Your old messages stay saved. You can unblock them later from the Friends page."
        confirmLabel="Block" onClose={() => setConfirm(false)} onConfirm={block} />
      <ReportModal target={report} onClose={() => setReport(null)} />
    </div>
  );
}

/** Friends page card: who can find me, and the people I blocked. */
export function PrivacyCard() {
  const { addToast } = useToast();
  const { refreshAll } = useConnect();
  const [discoverable, setDiscoverable] = useState(null);
  const [blocked, setBlocked] = useState(null);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    let alive = true;
    Promise.all([connectApi.privacy(), connectApi.blocked()]).then(([p, b]) => { if (alive) { setDiscoverable(p.data.discoverable); setBlocked(b.data.items); } }).catch(() => { if (alive) setBlocked([]); });
    return () => { alive = false; };
  }, []);
  const toggle = async () => {
    const next = !discoverable;
    setDiscoverable(next);
    try { await connectApi.setPrivacy(next); } catch (err) { setDiscoverable(!next); addToast(formatApiError(err), 'error'); }
  };
  const unblock = async (p) => {
    setBusy(p.id);
    try { await connectApi.unblock(p.id); setBlocked((b) => b.filter((x) => x.id !== p.id)); addToast(`${p.name} was unblocked`); refreshAll(); } catch (err) { addToast(formatApiError(err), 'error'); } finally { setBusy(''); }
  };
  return (
    <Card className="space-y-4 p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><ShieldCheck className="h-4 w-4 text-blue-600" aria-hidden="true" />Privacy</h2>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0"><p id="disc-label" className="text-sm font-semibold text-slate-900 dark:text-white">Let people find me</p><p className="text-xs text-slate-500">When this is off, nobody can find you by name or email to send a request. Your friends stay your friends.</p></div>
        <button type="button" role="switch" aria-checked={Boolean(discoverable)} aria-labelledby="disc-label" disabled={discoverable === null} onClick={toggle} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:opacity-50 ${discoverable ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}><span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${discoverable ? 'translate-x-5' : ''}`} /></button>
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold text-slate-900 dark:text-white">Blocked people</p>
        {blocked === null ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-label="Loading" />
          : blocked.length === 0 ? <p className="text-sm text-slate-500">You have not blocked anyone.</p>
            : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {blocked.map((p) => (
                  <li key={p.id} className="flex min-h-[48px] items-center justify-between gap-3">
                    <span className="truncate text-sm text-slate-800 dark:text-slate-200">{p.name}</span>
                    <Button variant="secondary" className="min-h-[40px]" loading={busy === p.id} onClick={() => unblock(p)}>Unblock</Button>
                  </li>
                ))}
              </ul>
            )}
      </div>
    </Card>
  );
}
