import React, { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { communityApi } from '../../api/community.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';
import { Button, Modal, Textarea } from '../ui.jsx';

export const REASONS = [
  ['spam', 'Spam or advertising'], ['impersonation', 'Pretending to be someone else'], ['asks_for_money', 'Asks for money or personal details'],
  ['harassment', 'Abusive or unsafe'], ['inappropriate', 'Inappropriate content'], ['other', 'Something else'],
];

export function useList(fetcher, deps) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => { setErr(''); return fetcher().then((r) => setData(r.data)).catch((e) => { setErr(formatApiError(e)); setData({ items: [] }); }); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return { data, err, load, setData };
}

export function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
      <input aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
    </div>
  );
}

export function ReportModal({ target, onClose }) {
  const { addToast } = useToast();
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await communityApi.report({ targetType: target.type, userId: target.type === 'profile' ? target.userId : undefined, groupId: target.type === 'group' ? target.groupId : undefined, listingId: target.type === 'listing' ? target.listingId : undefined, reason, details: details || undefined });
      if (alsoBlock && target.userId) await communityApi.block(target.userId).catch(() => {});
      addToast('Report sent. Thank you.');
      onClose(true);
    } catch (e) {
      addToast(formatApiError(e), 'error');
    } finally { setBusy(false); }
  };
  return (
    <Modal isOpen onClose={() => onClose(false)} title={`Report ${target.label}`}>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">What is wrong?</legend>
        {REASONS.map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="reason" checked={reason === k} onChange={() => setReason(k)} /> {label}</label>
        ))}
      </fieldset>
      <Textarea label="Details (optional)" maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} className="mt-3" />
      {target.userId && <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} /> Also block this person</label>}
      <p className="mt-2 text-xs text-slate-500">Reports go to platform admins. The person is not told who reported them. Repeated reports from different people hide a listing until it is reviewed.</p>
      <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => onClose(false)}>Cancel</Button><Button loading={busy} onClick={send}>Send report</Button></div>
    </Modal>
  );
}

export function AskModal({ title, intro, onClose, onSend }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal isOpen onClose={onClose} title={title}>
      <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">{intro}</p>
      <Textarea label="Short message (optional)" maxLength={200} value={msg} onChange={(e) => setMsg(e.target.value)} />
      <p className="mt-2 text-xs text-slate-500">Please do not write phone numbers, emails or links. If they accept, you become Connect friends and chat there (Connect shows account names).</p>
      <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={async () => { setBusy(true); try { await onSend(msg); } finally { setBusy(false); } }}>Send request</Button></div>
    </Modal>
  );
}

export function Chip({ children }) { return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">{children}</span>; }

