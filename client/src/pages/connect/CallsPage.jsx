import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Phone, PhoneMissed, PhoneCall, Video, Loader2 } from 'lucide-react';
import { Card, EmptyState } from '../../components/ui.jsx';
import Avatar from '../../components/connect/Avatar.jsx';
import { connectApi } from '../../api/connect.js';
import { useConnect } from '../../context/ConnectContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';
import { listTime } from '../../utils/connectFormat.js';

const mins = (ms) => { const s = Math.round(ms / 1000); return s < 60 ? `${s} sec` : `${Math.floor(s / 60)} min${s % 60 && s < 600 ? ` ${s % 60} sec` : ''}`; };

/** Recent finished calls. Tapping the call button rings that chat again. */
export default function CallsPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { callActions, callsEnabled } = useConnect();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let alive = true;
    connectApi.callHistory().then((r) => alive && setItems(r.data.items)).catch((e) => alive && setError(formatApiError(e)));
    return () => { alive = false; };
  }, []);

  const callBack = useCallback(async (it, mode) => {
    setBusy(`${it.id}${mode}`);
    try {
      const call = await callActions.start(it.conversationId, mode);
      navigate(`/connect/call/${call.id}`, { state: { title: it.name, mode } });
    } catch (e) { addToast(formatApiError(e), 'error'); } finally { setBusy(''); }
  }, [callActions, navigate, addToast]);

  if (error) return <Card className="p-2"><EmptyState icon={PhoneCall} title="Calls" description={error} /></Card>;
  if (!items) return <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading…</p>;
  if (!items.length) return <Card className="p-2"><EmptyState icon={PhoneCall} title="No calls yet" description={callsEnabled ? 'Start a voice or video call from any chat. Your recent calls will show up here.' : "Calls aren't set up on this server yet."} /></Card>;
  return (
    <Card className="divide-y divide-slate-100 p-0 dark:divide-slate-800">
      {items.map((it) => {
        const missed = it.outcome !== 'completed';
        const Dir = missed && it.direction === 'incoming' ? PhoneMissed : it.direction === 'outgoing' ? ArrowUpRight : ArrowDownLeft;
        const what = it.outcome === 'completed' ? mins(it.durationMs) : it.outcome === 'declined' ? 'Declined' : it.direction === 'outgoing' ? 'No answer' : 'Missed';
        return (
          <div key={it.id} className="flex min-h-[64px] items-center gap-3 px-4 py-2">
            <Avatar name={it.name} group={it.group} />
            <div className="min-w-0 flex-1">
              <p className={`truncate font-semibold ${missed && it.direction === 'incoming' ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>{it.name}</p>
              <p className="flex items-center gap-1 truncate text-xs text-slate-500"><Dir className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{it.mode === 'video' ? 'Video' : 'Voice'} · {what} · {listTime(it.at)}</p>
            </div>
            {['voice', 'video'].map((mode) => (
              <button key={mode} type="button" disabled={!callsEnabled || Boolean(busy)} onClick={() => callBack(it, mode)} aria-label={`${mode === 'video' ? 'Video' : 'Voice'} call ${it.name}`} className="flex h-11 w-11 items-center justify-center rounded-full text-blue-600 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:opacity-40 dark:text-sky-400 dark:hover:bg-slate-800">{mode === 'video' ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}</button>
            ))}
          </div>
        );
      })}
    </Card>
  );
}
