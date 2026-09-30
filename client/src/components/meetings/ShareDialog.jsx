import React, { useEffect, useState } from 'react';
import { Copy, Link2, Trash2 } from 'lucide-react';
import { Modal, Button, Select } from '../ui.jsx';
import { meetingsApi } from '../../api/meetings.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';
import { format } from 'date-fns';

/** Explicit, expiring, revocable, read-only sharing. Audio is never included. */
export default function ShareDialog({ meetingId, open, onClose }) {
  const { addToast } = useToast();
  const [status, setStatus] = useState(null);
  const [days, setDays] = useState('7');
  const [withTranscript, setWithTranscript] = useState(false);
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLink(null);
    meetingsApi.getShare(meetingId).then((r) => setStatus(r.data)).catch(() => setStatus({ active: false }));
  }, [open, meetingId]);

  const create = async () => {
    setBusy(true);
    try {
      const r = await meetingsApi.createShare(meetingId, { expiresInDays: parseInt(days, 10), includeTranscript: withTranscript });
      setLink(`${window.location.origin}/shared/${r.data.token}`);
      setStatus({ active: true, expiresAt: r.data.expiresAt, includeTranscript: withTranscript });
    } catch (err) {
      addToast(formatApiError(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      await meetingsApi.revokeShare(meetingId);
      setStatus({ active: false });
      setLink(null);
      addToast('Share link revoked');
    } catch (err) {
      addToast(formatApiError(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      addToast('Link copied');
    } catch {
      addToast('Copy failed — select the link and copy it manually', 'error');
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Share meeting">
      <div className="space-y-4 text-sm">
        <p className="text-slate-600 dark:text-slate-300">
          Anyone with the link can read the summary, minutes and action items. The recording is never shared.
        </p>

        {status?.active && !link && (
          <p className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 px-3 py-2">
            A link is active until {format(new Date(status.expiresAt), 'MMM d, yyyy h:mm a')}. For security it can’t be shown again — revoke it to create a new one.
          </p>
        )}

        {link && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
              <Link2 className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
              <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Share link" className="flex-1 min-w-0 bg-transparent text-xs dark:text-white" />
              <Button size="sm" variant="secondary" icon={Copy} onClick={copy}>Copy</Button>
            </div>
            <p className="text-xs text-amber-600">Copy it now — it won’t be shown again.</p>
          </div>
        )}

        {!status?.active && !link && (
          <div className="space-y-3">
            <Select label="Link expires after" value={days} onChange={(e) => setDays(e.target.value)} options={[{ value: '1', label: '1 day' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }]} />
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={withTranscript} onChange={(e) => setWithTranscript(e.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
              <span className="text-slate-700 dark:text-slate-300">Also include the full transcript</span>
            </label>
            <Button onClick={create} loading={busy}>Create link</Button>
          </div>
        )}

        {status?.active && (
          <Button variant="danger" icon={Trash2} onClick={revoke} loading={busy}>Revoke link</Button>
        )}
      </div>
    </Modal>
  );
}
