import React, { useEffect, useState } from 'react';
import { BookOpen, ExternalLink, Flag, Plus, Trash2, Library } from 'lucide-react';
import { extrasApi } from '../../api/communityExtras.js';
import { lifeApi } from '../../api/life.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';
import { Button, Card, Badge, Spinner, Modal, Input, Textarea, EmptyState } from '../ui.jsx';
import { useList, SearchBox, REASONS } from './shared.jsx';

const blank = { title: '', url: '', skill: '', note: '' };

function ShareModal({ onClose, onDone }) {
  const { addToast } = useToast();
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    try { await extrasApi.share({ title: f.title, url: f.url, skill: f.skill, note: f.note || undefined }); addToast('Shared. Thank you.'); onDone(); } catch (e) { addToast(formatApiError(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen onClose={onClose} title="Share a learning resource">
      <div className="space-y-3">
        <Input label="Title" value={f.title} maxLength={100} onChange={set('title')} autoFocus />
        <Input label="Web address (http or https)" value={f.url} maxLength={300} onChange={set('url')} placeholder="https://" />
        <Input label="One skill word" value={f.skill} maxLength={40} onChange={set('skill')} placeholder="for example: excel" />
        <Textarea label="Why it helps (optional)" value={f.note} maxLength={200} onChange={set('note')} />
        <p className="text-xs text-slate-500">You share under your Community display name, never your email. Do not put phone numbers or chat handles in the title or note. LifeOS does not check or endorse links.</p>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={f.title.trim().length < 3 || f.url.trim().length < 3 || f.skill.trim().length < 2} onClick={save}>Share</Button></div>
    </Modal>
  );
}

function ReportResource({ resource, onClose }) {
  const { addToast } = useToast();
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await extrasApi.reportResource(resource.id, { reason, details: details || undefined }); addToast('Report sent. Thank you.'); onClose(true); } catch (e) { addToast(formatApiError(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen onClose={() => onClose(false)} title={`Report "${resource.title}"`}>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">What is wrong?</legend>
        {REASONS.map(([k, label]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="resource-reason" checked={reason === k} onChange={() => setReason(k)} /> {label}</label>)}
      </fieldset>
      <Textarea label="Details (optional)" maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} className="mt-3" />
      <p className="mt-2 text-xs text-slate-500">Reports go to platform admins. The person is not told who reported them. When 3 different people report a resource, it is hidden until an admin looks at it.</p>
      <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => onClose(false)}>Cancel</Button><Button loading={busy} onClick={send}>Send report</Button></div>
    </Modal>
  );
}

export default function LearningTab({ profileOn }) {
  const { addToast } = useToast();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [mine, setMine] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);
  const { data, err, load } = useList(() => extrasApi.resources({ q: dq, mine }), [dq, mine]);
  const [sharing, setSharing] = useState(false);
  const [rep, setRep] = useState(null);
  const [busyId, setBusyId] = useState('');

  const saveToKnowledge = async (r) => {
    setBusyId(r.id);
    try { await lifeApi.addEntry({ kind: 'link', title: r.title, body: r.note || '', url: r.url, tags: [r.skill] }); addToast('Saved to your Knowledge'); } catch (e) { addToast(formatApiError(e), 'error'); } finally { setBusyId(''); }
  };
  const remove = async (r) => {
    if (!window.confirm('Remove this resource?')) return;
    try { await extrasApi.removeResource(r.id); addToast('Removed'); load(); } catch (e) { addToast(formatApiError(e), 'error'); }
  };

  if (!data) return <div className="flex justify-center py-10"><Spinner /></div>;
  const items = Array.isArray(data.items) ? data.items : [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[12rem] flex-1"><SearchBox value={q} onChange={setQ} placeholder='Search a skill or word, for example "excel"' /></div>
        <Button variant={mine ? 'primary' : 'secondary'} onClick={() => setMine((v) => !v)}>{mine ? 'Showing: mine' : 'My resources'}</Button>
        <Button icon={Plus} disabled={!profileOn} title={profileOn ? '' : 'Switch on your profile first'} onClick={() => setSharing(true)}>Share a resource</Button>
      </div>
      <p className="text-xs text-slate-500">Links are shared by members. LifeOS does not check or endorse them, so only open what looks right to you. The website name is shown so you can see where a link goes.</p>
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      {items.length === 0 ? (
        <EmptyState icon={Library} title={mine ? 'You have not shared anything yet' : 'No resources found'} description={mine ? 'Share a link that helped you learn a skill.' : 'Try another word, or share one yourself.'} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((r) => (
            <li key={r.id}><Card className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="font-medium break-words">{r.title}</p>
                {r.status === 'hidden' && <Badge variant="error">Hidden pending review</Badge>}
              </div>
              <div className="flex flex-wrap gap-1.5"><Badge variant="success">{r.skill}</Badge></div>
              {r.note && <p className="text-sm text-slate-700 dark:text-slate-200 break-words">{r.note}</p>}
              <p className="text-xs text-slate-500">Link on <strong>{r.domain}</strong> · shared by {r.isOwner ? 'you' : r.ownerName}</p>
              <div className="flex flex-wrap items-center gap-2">
                <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />Open on {r.domain}
                </a>
                <Button size="sm" variant="secondary" icon={BookOpen} loading={busyId === r.id} onClick={() => saveToKnowledge(r)}>Save to my Knowledge</Button>
                {r.isOwner
                  ? <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(r)}>Remove</Button>
                  : (r.reported ? <Badge variant="info">Reported</Badge> : <Button size="sm" variant="ghost" icon={Flag} onClick={() => setRep(r)}>Report</Button>)}
              </div>
            </Card></li>
          ))}
        </ul>
      )}
      {sharing && <ShareModal onClose={() => setSharing(false)} onDone={() => { setSharing(false); setMine(true); load(); }} />}
      {rep && <ReportResource resource={rep} onClose={(done) => { setRep(null); if (done) load(); }} />}
    </div>
  );
}
