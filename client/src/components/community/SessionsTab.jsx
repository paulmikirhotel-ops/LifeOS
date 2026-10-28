import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, MessagesSquare, Clock, HandHeart } from 'lucide-react';
import { extrasApi } from '../../api/communityExtras.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';
import { Button, Card, Badge, Spinner, Modal, Input, Select, Textarea, EmptyState } from '../ui.jsx';

const MINUTES = [15, 20, 30, 45, 60, 75, 90];
const when = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const zone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } })();
const pad = (n) => String(n).padStart(2, '0');
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const LABEL = { done: 'Done', declined: 'Declined', cancelled: 'Cancelled', countered: 'Other time suggested', expired: 'Not answered in time' };

/** Pick a person (when starting fresh), a date and time in YOUR time zone, and how long. */
function TimeModal({ title, partners, fixedName, initial, onClose, onSend }) {
  const [userId, setUserId] = useState(partners?.[0]?.userId || '');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('17:00');
  const [minutes, setMinutes] = useState(initial?.minutes || 30);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const { addToast } = useToast();
  const start = date && time ? new Date(`${date}T${time}`) : null;
  const valid = start && !Number.isNaN(start.getTime()) && (partners ? Boolean(userId) : true);
  const send = async () => {
    setBusy(true);
    try { await onSend({ userId, startsAt: start.toISOString(), minutes: Number(minutes), note: note || undefined }); } catch (e) { addToast(formatApiError(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen onClose={onClose} title={title}>
      <div className="space-y-3">
        {partners ? <Select label="With" value={userId} onChange={(e) => setUserId(e.target.value)} options={partners.map((p) => ({ value: p.userId, label: `${p.name} (${p.role})` }))} /> : <p className="text-sm">With <strong>{fixedName}</strong></p>}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date" type="date" min={todayLocal()} value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Start time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <Select label="How long" value={minutes} onChange={(e) => setMinutes(e.target.value)} options={MINUTES.map((m) => ({ value: m, label: `${m} minutes` }))} />
        <Textarea label="Note (optional)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="What will you work on?" />
        <p className="text-xs text-slate-500">The time you choose is in your own time zone{zone ? ` (${zone})` : ''}. The other person sees it in theirs. Please do not put phone numbers or chat handles in the note: you meet in Connect.</p>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!valid} onClick={send}>Send</Button></div>
    </Modal>
  );
}

function Row({ s, children, badge }) {
  return (
    <Card className="space-y-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm"><strong>{s.withName}</strong> · {when(s.startsAt)} · {s.minutes} min</p>
        {badge}
      </div>
      {s.note && <p className="text-sm text-slate-600 dark:text-slate-300 break-words">"{s.note}"</p>}
      {children}
    </Card>
  );
}

export default function SessionsTab() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [partners, setPartners] = useState([]);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // { mode: 'new' } or { mode: 'counter', s }
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const [s, p] = await Promise.all([extrasApi.sessions(), extrasApi.partners()]);
      const d = s?.data;
      if (!d || !Array.isArray(d.upcoming) || !Array.isArray(d.waitingForYou) || !Array.isArray(d.waitingForThem) || !Array.isArray(d.recent)) throw new Error('The server sent something unexpected. Please try again.');
      setData(d);
      setPartners(Array.isArray(p?.data?.items) ? p.data.items : []);
    } catch (e) { setError(e?.response ? formatApiError(e) : String(e?.message || e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (id, fn, ok) => {
    setBusy(id);
    try { await fn(); if (ok) addToast(ok); await load(); } catch (e) { addToast(formatApiError(e), 'error'); load(); } finally { setBusy(''); }
  };

  if (error) return <Card className="p-4 text-red-700 dark:text-red-300">{error} <Button variant="secondary" onClick={load}>Try again</Button></Card>;
  if (!data) return <div className="flex justify-center py-10"><Spinner /></div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600 dark:text-slate-300">Plan a time with a mentor or learner you already connected with. Times are shown in your time zone{zone ? ` (${zone})` : ''}.</p>
        <Button icon={Clock} disabled={partners.length === 0} onClick={() => setModal({ mode: 'new' })}>Propose a time</Button>
      </div>
      {partners.length === 0 && (
        <EmptyState icon={HandHeart} title="No one to plan with yet" description="You can plan a session once a mentor request between you was accepted. Ask a mentor in the Mentors tab, or accept a request in the Requests tab." />
      )}

      <section aria-label="Waiting for your answer" className="space-y-2">
        <h2 className="text-sm font-semibold">Waiting for your answer</h2>
        {data.waitingForYou.length === 0 ? <p className="text-sm text-slate-500">Nothing waiting.</p> : data.waitingForYou.map((s) => (
          <Row key={s.id} s={s}>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" loading={busy === s.id} onClick={() => act(s.id, () => extrasApi.respond(s.id, 'accept'), 'Accepted')}>Accept</Button>
              <Button size="sm" variant="secondary" disabled={busy === s.id} onClick={() => setModal({ mode: 'counter', s })}>Suggest another time</Button>
              <Button size="sm" variant="ghost" disabled={busy === s.id} onClick={() => act(s.id, () => extrasApi.respond(s.id, 'decline'), 'Declined')}>Decline</Button>
            </div>
          </Row>
        ))}
      </section>

      <section aria-label="Coming up" className="space-y-2">
        <h2 className="text-sm font-semibold">Coming up</h2>
        {data.upcoming.length === 0 ? <p className="text-sm text-slate-500">No sessions planned.</p> : data.upcoming.map((s) => (
          <Row key={s.id} s={s} badge={<Badge variant="success">Agreed</Badge>}>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={MessagesSquare} onClick={() => navigate('/connect/chats')}>Open Connect</Button>
              {s.inMyCalendar
                ? <Badge variant="info">In your calendar</Badge>
                : <Button size="sm" variant="secondary" icon={CalendarPlus} loading={busy === `cal-${s.id}`} onClick={() => act(`cal-${s.id}`, () => extrasApi.addToCalendar(s.id), 'Added to your calendar')}>Add to my calendar</Button>}
              <Button size="sm" variant="ghost" onClick={() => window.confirm('Cancel this session? The other person is told.') && act(s.id, () => extrasApi.cancel(s.id), 'Cancelled')}>Cancel session</Button>
            </div>
          </Row>
        ))}
      </section>

      <section aria-label="Waiting for them" className="space-y-2">
        <h2 className="text-sm font-semibold">Waiting for their answer</h2>
        {data.waitingForThem.length === 0 ? <p className="text-sm text-slate-500">Nothing waiting.</p> : data.waitingForThem.map((s) => (
          <Row key={s.id} s={s} badge={<Badge variant="info">Waiting</Badge>}>
            <div><Button size="sm" variant="ghost" loading={busy === s.id} onClick={() => act(s.id, () => extrasApi.cancel(s.id), 'Cancelled')}>Cancel proposal</Button></div>
          </Row>
        ))}
      </section>

      {data.recent.length > 0 && (
        <section aria-label="Recent" className="space-y-2">
          <h2 className="text-sm font-semibold">Recent</h2>
          {data.recent.map((s) => <Row key={s.id} s={s} badge={<Badge variant="warning">{LABEL[s.state] || s.state}</Badge>} />)}
        </section>
      )}

      {modal?.mode === 'new' && (
        <TimeModal title="Propose a time" partners={partners} onClose={() => setModal(null)}
          onSend={async (b) => { await extrasApi.propose(b); addToast('Proposal sent'); setModal(null); load(); }} />
      )}
      {modal?.mode === 'counter' && (
        <TimeModal title="Suggest another time" fixedName={modal.s.withName} initial={modal.s} onClose={() => setModal(null)}
          onSend={async (b) => { await extrasApi.counter(modal.s.id, { startsAt: b.startsAt, minutes: b.minutes, note: b.note }); addToast('Sent'); setModal(null); load(); }} />
      )}
    </div>
  );
}
