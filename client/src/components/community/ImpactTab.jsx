import React, { useEffect, useState } from 'react';
import { Plus, Flag, MessagesSquare, ShieldCheck } from 'lucide-react';
import { communityApi } from '../../api/community.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';
import { Button, Card, Badge, Spinner, Modal, Input, Select, Textarea, EmptyState } from '../ui.jsx';
import { useList, SearchBox, ReportModal, AskModal } from './shared.jsx';
import { useNavigate } from 'react-router-dom';

const CATS = [['', 'All'], ['volunteering', 'Volunteering'], ['tutoring', 'Tutoring'], ['digital_skills', 'Digital skills'], ['project', 'Community projects']];
const CAT_LABEL = Object.fromEntries(CATS.filter(([k]) => k));
const MODE_LABEL = { online: 'Online', in_person: 'In person', both: 'Online or in person' };
const csv = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const niceDate = (d) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export default function ImpactTab({ profileOn, onChanged }) {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [cat, setCat] = useState('');
  const [mine, setMine] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);
  const { data, err, load } = useList(() => communityApi.listings({ q: dq, category: cat, mine }), [dq, cat, mine]);
  const [ask, setAsk] = useState(null);
  const [rep, setRep] = useState(null);
  const [creating, setCreating] = useState(false);
  const act = async (fn, ok) => { try { await fn(); if (ok) addToast(ok); load(); onChanged(); } catch (e) { addToast(formatApiError(e), 'error'); } };

  if (!data) return <div className="flex justify-center py-10"><Spinner /></div>;
  return (
    <div className="space-y-3">
      <div role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
        Posters and organizations are not verified unless a badge says so. Real volunteer work is free: never send money, ID numbers or your home address. Meet in public places and tell someone you trust. LifeOS does not run background checks.
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[12rem] flex-1"><SearchBox value={q} onChange={setQ} placeholder="Search opportunities" /></div>
        <Button variant={mine ? 'primary' : 'secondary'} onClick={() => setMine((v) => !v)}>{mine ? 'Showing: my listings' : 'My listings'}</Button>
        <Button icon={Plus} disabled={!profileOn} title={profileOn ? '' : 'Switch on your profile first'} onClick={() => setCreating(true)}>Post an opportunity</Button>
      </div>
      <div role="tablist" aria-label="Category" className="flex flex-wrap gap-2">
        {CATS.map(([k, label]) => (
          <button key={k || 'all'} role="tab" aria-selected={cat === k} onClick={() => setCat(k)}
            className={`rounded-full border px-3 py-1 text-sm ${cat === k ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>{label}</button>
        ))}
      </div>
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      {data.items.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={mine ? 'You have not posted anything' : 'No opportunities found'} description={mine ? 'Post a way people can help, for free.' : 'Try another category or word, or post one yourself.'} />
      ) : (
        <ul className="space-y-3">
          {data.items.map((l) => (
            <li key={l.id}><Card className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="info">{CAT_LABEL[l.category]}</Badge>
                <Badge variant="info">{MODE_LABEL[l.mode]}{l.location ? `: ${l.location}` : ''}</Badge>
                {l.verified ? <Badge variant="success">Reviewed by a LifeOS admin</Badge> : <Badge variant="warning">Not verified</Badge>}
                {l.status === 'closed' && <Badge variant="warning">Closed</Badge>}
                {l.status === 'hidden' && <Badge variant="error">Hidden pending review</Badge>}
              </div>
              <h2 className="text-base font-medium">{l.title}</h2>
              <p className="text-sm text-slate-700 dark:text-slate-200">{l.description}</p>
              {l.skills.length > 0 && <p className="text-xs text-slate-500">Skills: {l.skills.join(', ')}</p>}
              <p className="text-xs text-slate-500">
                Posted by {l.ownerName}{l.orgName ? ` for "${l.orgName}" (typed by the poster)` : ''} · {l.spotsLeft} of {l.spots} spots left{l.startsAt ? ` · starts ${niceDate(l.startsAt)}` : ''}
              </p>
              {l.category === 'tutoring' && <p className="text-xs text-slate-500">If children are involved, follow the organizer's safeguarding rules. Never be alone with a child you do not know.</p>}
              <div className="flex flex-wrap items-center gap-2">
                {l.isAccepted && <Badge variant="success">You are accepted. See Connect.</Badge>}
                {!l.isOwner && !l.isAccepted && l.requested && <Badge variant="info">Interest sent</Badge>}
                {!l.isOwner && !l.isAccepted && !l.requested && l.status === 'open' && <Button size="sm" disabled={l.spotsLeft === 0} onClick={() => setAsk(l)}>{l.spotsLeft === 0 ? 'No spots left' : "I'm interested"}</Button>}
                {l.isOwner && l.status !== 'hidden' && <Button size="sm" variant="secondary" onClick={() => act(() => communityApi.updateListing(l.id, { status: l.status === 'open' ? 'closed' : 'open' }), l.status === 'open' ? 'Listing closed' : 'Listing reopened')}>{l.status === 'open' ? 'Close listing' : 'Reopen'}</Button>}
                {!l.isOwner && <Button size="sm" variant="ghost" icon={Flag} onClick={() => setRep({ type: 'listing', listingId: l.id, label: l.title })}>Report</Button>}
              </div>
              {!l.isOwner && <p className="text-xs text-slate-500">"I'm interested" only sends your display name and message. If the poster accepts, you become Connect friends and chat there.</p>}
            </Card></li>
          ))}
        </ul>
      )}
      {ask && (
        <AskModal title={`Show interest: ${ask.title}`} intro="The poster sees your display name and your message, and decides."
          onClose={() => setAsk(null)}
          onSend={async (msg) => { try { await communityApi.interest(ask.id, msg); addToast('Interest sent'); setAsk(null); load(); } catch (e) { addToast(formatApiError(e), 'error'); } }} />
      )}
      {rep && <ReportModal target={rep} onClose={(done) => { setRep(null); if (done) load(); }} />}
      {creating && <NewListing onClose={() => setCreating(false)} onDone={() => { setCreating(false); setMine(true); load(); onChanged(); }} />}
    </div>
  );
}

function NewListing({ onClose, onDone }) {
  const { addToast } = useToast();
  const [f, setF] = useState({ category: 'volunteering', title: '', description: '', skills: '', location: 'Online', mode: 'online', spots: 5, orgName: '', audience: 'friends' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = async () => {
    setBusy(true); setError('');
    try {
      await communityApi.createListing({ ...f, skills: csv(f.skills), spots: Number(f.spots) || 5, orgName: f.orgName || undefined, location: f.location || undefined });
      addToast('Posted');
      onDone();
    } catch (e) { setError(formatApiError(e)); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen onClose={onClose} title="Post an opportunity">
      <div className="space-y-3">
        <Select label="Type" value={f.category} onChange={set('category')} options={CATS.filter(([k]) => k).map(([value, label]) => ({ value, label }))} />
        <Input label="Title" value={f.title} maxLength={100} onChange={set('title')} autoFocus />
        <Textarea label="What will people do? (free help only)" value={f.description} maxLength={500} onChange={set('description')} />
        <Input label="Skills needed (commas)" value={f.skills} onChange={set('skills')} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Where" value={f.mode} onChange={set('mode')} options={[{ value: 'online', label: 'Online' }, { value: 'in_person', label: 'In person' }, { value: 'both', label: 'Both' }]} />
          <Input label="Town or Online (no street address)" value={f.location} maxLength={80} onChange={set('location')} />
          <Input label="Spots" type="number" min="1" max="100" value={f.spots} onChange={set('spots')} />
          <Input label="Organization name (optional)" value={f.orgName} maxLength={80} onChange={set('orgName')} />
        </div>
        <Select label="Who can find this" value={f.audience} onChange={set('audience')} options={[{ value: 'friends', label: 'Only my Connect friends' }, { value: 'everyone', label: 'Everyone in LifeOS' }]} />
        <p className="text-xs text-slate-500">Do not include phone numbers, emails, links or payment requests: they are rejected. People ask to help and you decide. Anything you type as an organization name is not verified.</p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={f.title.trim().length < 4 || f.description.trim().length < 10} onClick={save}>Post</Button></div>
    </Modal>
  );
}
