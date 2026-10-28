import React, { useState } from 'react';
import { Mail } from 'lucide-react';
import { Button, Card, Input } from '../ui.jsx';
import { meetingsApi } from '../../api/meetings.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';

/** Organizer-only: e-mail the minutes link again to everyone who joined, plus optional extra addresses. */
export default function SendMinutesCard({ meeting }) {
  const { addToast } = useToast();
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);

  if (meeting.minutesSharing?.enabled === false) return null;
  const ready = Boolean(meeting.summary?.executiveSummary || meeting.minutes?.content || meeting.processing?.minutes === 'done');

  const send = async () => {
    const emails = extra.split(/[\s,;]+/).filter(Boolean);
    setBusy(true);
    try {
      const res = (await meetingsApi.sendMinutes(meeting.id, emails)).data;
      addToast(res.sent ? `Minutes sent to ${res.sent} ${res.sent === 1 ? 'person' : 'people'}` : 'Nobody to send to yet. Add an e-mail below.', res.sent ? 'success' : 'info');
      if (res.sent) setExtra('');
    } catch (err) {
      addToast(formatApiError(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5 space-y-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><Mail className="h-4 w-4" aria-hidden="true" /></span>
        <div className="min-w-0">
          <p className="font-bold text-slate-900 dark:text-white">Send the minutes</p>
          <p className="text-sm text-slate-500">E-mails a read-only minutes link to everyone who joined and left an address. Add more people below if you like.</p>
        </div>
      </div>
      <Input label="Extra e-mails (optional)" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="name@example.com, other@example.com" />
      <Button onClick={send} loading={busy} disabled={!ready || busy} icon={Mail} className="w-full sm:w-auto min-h-[44px]">Send minutes now</Button>
      {!ready && <p className="text-xs text-slate-500">Available once the minutes are ready.</p>}
    </Card>
  );
}
