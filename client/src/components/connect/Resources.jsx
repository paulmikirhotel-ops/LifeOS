import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { CheckSquare, Target, CalendarDays, Video, NotebookPen, ChevronRight, Copy, Check, ExternalLink, Plus, Search, Loader2, Lock } from 'lucide-react';
import { Badge, Button, Modal } from '../ui.jsx';
import { connectApi } from '../../api/connect.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';

export const TYPES = {
  task: { label: 'Task', plural: 'Tasks', icon: CheckSquare, tone: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-sky-400', add: 'Add to my tasks' },
  goal: { label: 'Goal', plural: 'Goals', icon: Target, tone: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300', add: 'Add to my goals' },
  event: { label: 'Event', plural: 'Events', icon: CalendarDays, tone: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400', add: 'Add to my calendar' },
  meeting: { label: 'Meeting', plural: 'Meetings', icon: Video, tone: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-300' },
  note: { label: 'Note', plural: 'Notes', icon: NotebookPen, tone: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200', add: 'Save to my journal' },
};

const when = (iso, allDay) => (iso ? format(new Date(iso), allDay ? 'EEE d MMM yyyy' : 'EEE d MMM yyyy, HH:mm') : '');

/** The card shown inside a chat bubble. Tap it to see the details. */
export function ResourceCard({ m, mine }) {
  const [open, setOpen] = useState(false);
  const t = TYPES[m.resource.type];
  const Icon = t.icon;
  return (
    <>
      <button type="button" onClick={() => !m.pending && setOpen(true)} className={`flex w-64 max-w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors ${mine ? 'bg-white/15 hover:bg-white/25' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600'}`}>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${mine ? 'bg-white/20' : t.tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[11px] font-bold uppercase tracking-wide ${mine ? 'text-blue-100' : 'text-slate-500'}`}>{t.label}</span>
          <span className="block truncate text-sm font-semibold">{m.resource.title}</span>
          {m.resource.subtitle && <span className={`block truncate text-xs ${mine ? 'text-blue-100' : 'text-slate-500'}`}>{m.resource.subtitle}</span>}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
      </button>
      {open && <ResourceModal messageId={m.id} onClose={() => setOpen(false)} />}
    </>
  );
}

function Row({ label, children }) {
  if (children == null || children === '') return null;
  return <div className="flex gap-3 text-sm"><dt className="w-24 shrink-0 text-slate-500">{label}</dt><dd className="min-w-0 flex-1 break-words text-slate-900 dark:text-slate-100">{children}</dd></div>;
}

function Body({ r }) {
  const d = r.data || {};
  if (r.type === 'task') {
    return (
      <dl className="space-y-2">
        <Row label="Priority"><Badge variant="info">{d.priority}</Badge></Row>
        <Row label="Status">{d.status?.replace('_', ' ')}</Row>
        <Row label="Due">{when(d.dueDate)}</Row>
        <Row label="Category">{d.category}</Row>
        <Row label="Estimate">{d.estimatedMinutes ? `${d.estimatedMinutes} min` : ''}</Row>
        <Row label="Details"><span className="whitespace-pre-wrap">{d.description}</span></Row>
        {d.subtasks?.length > 0 && <Row label="Steps"><ul className="space-y-1">{d.subtasks.map((s, i) => <li key={i} className="flex items-center gap-2"><span className={`h-4 w-4 rounded border ${s.isDone ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`} aria-hidden="true" />{s.title}</li>)}</ul></Row>}
      </dl>
    );
  }
  if (r.type === 'goal') {
    return (
      <dl className="space-y-2">
        <Row label="Progress"><div className="flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full bg-blue-600" style={{ width: `${d.progress || 0}%` }} /></div><span>{d.progress || 0}%</span></div></Row>
        <Row label="Type">{d.type === 'long_term' ? 'Long term' : 'Short term'}</Row>
        <Row label="Target date">{when(d.targetDate)}</Row>
        <Row label="Details"><span className="whitespace-pre-wrap">{d.description}</span></Row>
        {d.milestones?.length > 0 && <Row label="Milestones"><ul className="space-y-1">{d.milestones.map((s, i) => <li key={i} className="flex items-center gap-2"><span className={`h-4 w-4 rounded border ${s.isDone ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`} aria-hidden="true" />{s.title}</li>)}</ul></Row>}
      </dl>
    );
  }
  if (r.type === 'event') {
    return (
      <dl className="space-y-2">
        <Row label="Starts">{when(d.startAt, d.allDay)}</Row>
        <Row label="Ends">{d.endAt ? when(d.endAt, d.allDay) : ''}</Row>
        <Row label="Type">{d.type}</Row>
        <Row label="Details"><span className="whitespace-pre-wrap">{d.description}</span></Row>
      </dl>
    );
  }
  if (r.type === 'note') {
    return (
      <dl className="space-y-2">
        <Row label="Date">{when(d.entryDate, true)}</Row>
        <Row label="Mood">{d.mood}</Row>
        <Row label="Tags">{d.tags?.join(', ')}</Row>
        <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100">{d.content}</p>
      </dl>
    );
  }
  return (
    <dl className="space-y-2">
      <Row label="Status">{d.status === 'live' ? 'Live now' : d.status}</Row>
      <Row label="Starts">{when(d.startAt)}</Row>
      <Row label="Time zone">{d.timezone}</Row>
    </dl>
  );
}

/** Full details of a shared item, with the right button: add it to my workspace, or open the meeting. */
export function ResourceModal({ messageId, onClose }) {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    connectApi.getResource(messageId).then((x) => alive && setR(x.data)).catch((err) => alive && setError(formatApiError(err)));
    return () => { alive = false; };
  }, [messageId]);

  const t = r && TYPES[r.type];
  const add = async () => {
    setBusy(true);
    try {
      const x = await connectApi.addResource(messageId);
      setR((p) => ({ ...p, added: { path: x.data.created.path } }));
      addToast('Added to your workspace');
    } catch (err) { addToast(formatApiError(err), 'error'); } finally { setBusy(false); }
  };
  const go = (path) => { onClose(); navigate(path); };
  const copy = async () => { try { await navigator.clipboard.writeText(r.data.password); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };

  return (
    <Modal isOpen onClose={onClose} title={t ? t.label : 'Shared item'}>
      {error ? <p className="py-6 text-center text-sm text-slate-500">{error}</p>
        : !r ? <p className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading…</p>
          : (
            <div className="space-y-4">
              <div>
                <p className="break-words text-lg font-bold text-slate-900 dark:text-white">{r.title}</p>
                <p className="text-sm text-slate-500">{r.mine ? 'Shared by you' : `Shared by ${r.senderName}`} · a copy as it was when shared</p>
              </div>
              <Body r={r} />
              {r.type === 'meeting' && r.data.password && (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-500/10">
                  <span className="flex items-center gap-2"><Lock className="h-4 w-4" aria-hidden="true" />Password: <strong className="font-mono tracking-wider">{r.data.password}</strong></span>
                  <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 font-semibold text-blue-600" aria-label="Copy password">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy'}</button>
                </div>
              )}
              {r.type === 'note' && !r.mine && <p className="text-xs text-slate-500">This is a private note that {r.senderName} chose to share with this chat.</p>}
              <div className="flex flex-wrap gap-2">
                {r.type === 'meeting' && (r.open
                  ? <Button icon={ExternalLink} className="!bg-blue-600 hover:!bg-blue-700 !text-white" onClick={() => go(r.open)}>{r.open.startsWith('/meetings/') ? 'Open meeting' : 'Open invitation'}</Button>
                  : <p className="text-sm text-slate-500">No invitation link was shared. Ask {r.senderName} to share the meeting link.</p>)}
                {r.type !== 'meeting' && !r.mine && (r.added
                  ? <Button variant="secondary" icon={Check} onClick={() => go(r.added.path)}>Added. Open</Button>
                  : r.canAdd ? <Button icon={Plus} loading={busy} className="!bg-blue-600 hover:!bg-blue-700 !text-white" onClick={add}>{t.add}</Button>
                    : <p className="text-sm text-slate-500">{r.reason}</p>)}
                {r.mine && r.open && <Button variant="secondary" icon={ExternalLink} onClick={() => go(r.open)}>Open in LifeOS</Button>}
              </div>
            </div>
          )}
    </Modal>
  );
}

/** Pick a LifeOS item from my active workspace to share into the chat. */
export function ShareResourceModal({ open, onClose, onShare }) {
  const { addToast } = useToast();
  const [type, setType] = useState('task');
  const [q, setQ] = useState('');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(null);
  const [withPw, setWithPw] = useState(false);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setPicked(null); setQ(''); setWithPw(false); setPw(''); } }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setItems(null); setError('');
    const t = setTimeout(() => {
      connectApi.shareOptions(type, q.trim()).then((r) => alive && setItems(r.data.items)).catch((err) => alive && (setItems([]), setError(formatApiError(err))));
    }, q ? 300 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [open, type, q]);

  const send = async () => {
    setBusy(true);
    try { await onShare({ type, id: picked.id, ...(type === 'meeting' && withPw ? { includePassword: true, ...(pw ? { password: pw } : {}) } : {}) }); onClose(); }
    catch (err) { addToast(formatApiError(err), 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Share a LifeOS item">
      <div className="space-y-3">
        <div role="tablist" aria-label="Item type" className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {Object.entries(TYPES).map(([k, v]) => (
            <button key={k} role="tab" aria-selected={type === k} onClick={() => { setType(k); setPicked(null); }}
              className={`flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${type === k ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-sky-400' : 'text-slate-500'}`}><v.icon className="h-4 w-4" aria-hidden="true" />{v.plural}</button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <label htmlFor="share-search" className="sr-only">Search</label>
          <input id="share-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${TYPES[type].plural.toLowerCase()}`} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
        </div>
        <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
          {items === null ? <p className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading…</p>
            : error ? <p className="px-4 py-6 text-center text-sm text-slate-500">{error}</p>
              : items.length === 0 ? <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing to share here yet.</p>
                : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {items.map((it) => (
                      <li key={it.id}>
                        <button type="button" onClick={() => setPicked(it)} aria-pressed={picked?.id === it.id} className={`flex min-h-[56px] w-full items-center gap-3 px-3 text-left ${picked?.id === it.id ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>
                          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{it.title}</span><span className="block truncate text-xs text-slate-500">{it.subtitle}</span></span>
                          {picked?.id === it.id && <Check className="h-5 w-5 text-blue-600" aria-hidden="true" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
        </div>
        {type === 'note' && picked && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">This sends a copy of the entry's text to everyone in this chat. Your journal itself stays private.</p>}
        {type === 'meeting' && picked?.organizer && (
          <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
            <label className="flex items-center gap-2"><input type="checkbox" checked={withPw} onChange={(e) => setWithPw(e.target.checked)} />Include the meeting password in the message</label>
            {withPw && <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Type the password (leave empty for a brand-new link)" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" />}
            <p className="text-xs text-slate-500">Everyone in this chat will be able to read the password.</p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button className="!bg-blue-600 hover:!bg-blue-700 !text-white" loading={busy} disabled={!picked || busy} onClick={send}>Share</Button>
        </div>
      </div>
    </Modal>
  );
}
