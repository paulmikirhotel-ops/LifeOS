import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { HandHeart, ShieldAlert, Search, Plus, MessagesSquare, Flag, Ban } from 'lucide-react';
import { communityApi } from '../api/community.js';
import { useToast } from '../context/ToastContext.jsx';
import { formatApiError } from '../utils/errors.js';
import { Button, Card, Badge, Spinner, Modal, Input, Select, Textarea, EmptyState } from '../components/ui.jsx';
import { useList, SearchBox, ReportModal, AskModal, Chip } from '../components/community/shared.jsx';
import ImpactTab from '../components/community/ImpactTab.jsx';
import VolunteerLog from '../components/community/VolunteerLog.jsx';
import LearningTab from '../components/community/LearningTab.jsx';
import SessionsTab from '../components/community/SessionsTab.jsx';

const TABS = [['mentors', 'Mentors'], ['groups', 'Study groups'], ['impact', 'Impact Network'], ['learning', 'Learning'], ['sessions', 'Sessions'], ['requests', 'Requests'], ['log', 'Volunteer log'], ['profile', 'My profile']];
const csv = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const niceDate = (d) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export default function CommunityPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'mentors';
  const [me, setMe] = useState(null);
  const [error, setError] = useState('');

  const loadMe = useCallback(() => communityApi.me().then((r) => { setMe(r.data); setError(''); }).catch((e) => setError(formatApiError(e))), []);
  useEffect(() => { loadMe(); }, [loadMe]);

  if (error && !me) return <Card className="p-6 text-center"><p className="text-sm text-red-600">{error}</p><Button className="mt-3" onClick={loadMe}>Try again</Button></Card>;
  if (!me) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-8">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><HandHeart className="h-6 w-6" /> Community</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Learn with others. People appear here only if they chose to. Chat and calls happen in Connect.</p>
      </header>
      <div role="note" className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Mentors and groups are run by volunteers and are not verified by LifeOS. Never pay anyone to mentor you, and never share money, ID numbers or your address.</span>
      </div>
      <div role="tablist" aria-label="Community sections" className="flex flex-wrap gap-2 border-b border-slate-200 pb-2 dark:border-slate-700">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams({ tab: k })}
            className={`min-h-[40px] rounded-lg px-3 text-sm font-medium ${tab === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
            {label}{k === 'requests' && me.incoming > 0 ? ` (${me.incoming})` : ''}
          </button>
        ))}
      </div>
      {!me.profile.enabled && tab !== 'profile' && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Your profile is off, so nobody can see you. You can still look around, ask to join groups and request mentors.{' '}
          <button className="font-medium text-indigo-600 underline" onClick={() => setParams({ tab: 'profile' })}>Set up my profile</button></p>
      )}
      {tab === 'mentors' && <Mentors />}
      {tab === 'groups' && <Groups profileOn={me.profile.enabled} onChanged={loadMe} />}
      {tab === 'impact' && <ImpactTab profileOn={me.profile.enabled} onChanged={loadMe} />}
      {tab === 'learning' && <LearningTab profileOn={me.profile.enabled} />}
      {tab === 'sessions' && <SessionsTab />}
      {tab === 'log' && <VolunteerLog />}
      {tab === 'requests' && <Requests onChanged={loadMe} />}
      {tab === 'profile' && <Profile initial={me.profile} onSaved={loadMe} />}
    </div>
  );
}

function Mentors() {
  const { addToast } = useToast();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);
  const { data, err, load } = useList(() => communityApi.mentors(dq), [dq]);
  const [ask, setAsk] = useState(null);
  const [rep, setRep] = useState(null);

  if (!data) return <div className="flex justify-center py-10"><Spinner /></div>;
  return (
    <div className="space-y-3">
      <SearchBox value={q} onChange={setQ} placeholder='Search a skill, for example "Excel"' />
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      {data.items.length === 0 ? (
        <EmptyState icon={HandHeart} title="No mentors found" description="Nobody matches yet. Try a different word, or switch on your own profile and offer a skill." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.items.map((m) => (
            <li key={m.userId}><Card className="space-y-2 p-4">
              <div className="flex items-center gap-3">
                <div aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700">{m.displayName.slice(0, 2).toUpperCase()}</div>
                <div className="min-w-0"><p className="truncate font-medium">{m.displayName}</p><p className="text-xs text-slate-500">{m.isFriend ? 'Connect friend' : 'Community member'}</p></div>
              </div>
              {m.intro && <p className="text-sm text-slate-700 dark:text-slate-200">{m.intro}</p>}
              <div className="flex flex-wrap gap-1.5">{m.offers.map((s) => <Badge key={s} variant="success">Offers: {s}</Badge>)}{m.wants.map((s) => <Chip key={s}>Learning: {s}</Chip>)}</div>
              {m.sharedHours > 0 && <p className="text-xs text-emerald-700 dark:text-emerald-400">Shared by them: {m.sharedHours} volunteering hours</p>}
              {(m.language || m.availability) && <p className="text-xs text-slate-500">{[m.language, m.availability].filter(Boolean).join(' · ')}</p>}
              <div className="flex flex-wrap items-center gap-2">
                {m.requested ? <Badge variant="info">Request sent</Badge> : <Button size="sm" onClick={() => setAsk(m)}>Request a session</Button>}
                <Button size="sm" variant="ghost" icon={Flag} onClick={() => setRep({ type: 'profile', userId: m.userId, label: m.displayName })}>Report</Button>
              </div>
            </Card></li>
          ))}
        </ul>
      )}
      {ask && (
        <AskModal title={`Request a session with ${ask.displayName}`} intro="They see your display name and your message. Nothing else about you."
          onClose={() => setAsk(null)}
          onSend={async (msg) => { try { await communityApi.requestSession(ask.userId, msg); addToast('Request sent'); setAsk(null); load(); } catch (e) { addToast(formatApiError(e), 'error'); } }} />
      )}
      {rep && <ReportModal target={rep} onClose={(done) => { setRep(null); if (done) load(); }} />}
    </div>
  );
}

function Groups({ profileOn, onChanged }) {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [mine, setMine] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);
  const { data, err, load } = useList(() => communityApi.groups({ q: dq, mine }), [dq, mine]);
  const [ask, setAsk] = useState(null);
  const [rep, setRep] = useState(null);
  const [creating, setCreating] = useState(false);

  const act = async (fn, ok) => { try { await fn(); if (ok) addToast(ok); load(); onChanged(); } catch (e) { addToast(formatApiError(e), 'error'); } };

  if (!data) return <div className="flex justify-center py-10"><Spinner /></div>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[12rem] flex-1"><SearchBox value={q} onChange={setQ} placeholder="Search study groups" /></div>
        <Button variant={mine ? 'primary' : 'secondary'} onClick={() => setMine((v) => !v)}>{mine ? 'Showing: my groups' : 'My groups'}</Button>
        <Button icon={Plus} disabled={!profileOn} title={profileOn ? '' : 'Switch on your profile first'} onClick={() => setCreating(true)}>Start a group</Button>
      </div>
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      {data.items.length === 0 ? (
        <EmptyState icon={HandHeart} title={mine ? 'You are not in a group yet' : 'No study groups found'} description={mine ? 'Join one, or start your own.' : 'Try another word, or start a group yourself.'} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.items.map((g) => (
            <li key={g.id}><Card className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="font-medium">{g.title}</p>
                {g.status === 'closed' && <Badge variant="warning">Closed</Badge>}
                {g.status === 'hidden' && <Badge variant="error">Hidden pending review</Badge>}
              </div>
              {g.topic && <p className="text-xs text-slate-500">Topic: {g.topic}</p>}
              {g.description && <p className="text-sm text-slate-700 dark:text-slate-200">{g.description}</p>}
              <p className="text-xs text-slate-500">By {g.ownerName} · {g.memberCount}/{g.maxMembers} members{g.nextSessionAt ? ` · next session ${niceDate(g.nextSessionAt)}` : ''}</p>
              <div className="flex flex-wrap items-center gap-2">
                {g.isMember && g.conversationId && <Button size="sm" icon={MessagesSquare} onClick={() => navigate(`/connect/chats/${g.conversationId}`)}>Open group chat</Button>}
                {!g.isMember && g.requested && <Badge variant="info">Request sent</Badge>}
                {!g.isMember && !g.requested && g.status === 'open' && <Button size="sm" disabled={g.full} onClick={() => setAsk(g)}>{g.full ? 'Full' : 'Ask to join'}</Button>}
                {g.isMember && !g.isOwner && <Button size="sm" variant="ghost" onClick={() => window.confirm('Leave this group?') && act(() => communityApi.leave(g.id), 'You left the group')}>Leave</Button>}
                {g.isOwner && g.status !== 'hidden' && <Button size="sm" variant="secondary" onClick={() => act(() => communityApi.updateGroup(g.id, { status: g.status === 'open' ? 'closed' : 'open' }), g.status === 'open' ? 'Group closed to new members' : 'Group reopened')}>{g.status === 'open' ? 'Close to new members' : 'Reopen'}</Button>}
                {!g.isOwner && <Button size="sm" variant="ghost" icon={Flag} onClick={() => setRep({ type: 'group', groupId: g.id, label: g.title })}>Report</Button>}
              </div>
            </Card></li>
          ))}
        </ul>
      )}
      {ask && (
        <AskModal title={`Ask to join "${ask.title}"`} intro="The organizer sees your display name and your message, and decides."
          onClose={() => setAsk(null)}
          onSend={async (msg) => { try { await communityApi.join(ask.id, msg); addToast('Request sent'); setAsk(null); load(); } catch (e) { addToast(formatApiError(e), 'error'); } }} />
      )}
      {rep && <ReportModal target={rep} onClose={(done) => { setRep(null); if (done) load(); }} />}
      {creating && <NewGroup onClose={() => setCreating(false)} onDone={() => { setCreating(false); setMine(true); load(); onChanged(); }} />}
    </div>
  );
}

function NewGroup({ onClose, onDone }) {
  const { addToast } = useToast();
  const [f, setF] = useState({ title: '', topic: '', description: '', language: '', audience: 'friends', maxMembers: 12 });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    try {
      await communityApi.createGroup({ ...f, maxMembers: Number(f.maxMembers) || 12, topic: f.topic || undefined, description: f.description || undefined, language: f.language || undefined });
      addToast('Group created. Its chat is in Connect.');
      onDone();
    } catch (e) { addToast(formatApiError(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen onClose={onClose} title="Start a study group">
      <div className="space-y-3">
        <Input label="Group name" value={f.title} maxLength={80} onChange={set('title')} autoFocus />
        <Input label="Topic" value={f.topic} maxLength={60} onChange={set('topic')} />
        <Textarea label="What will you study together?" value={f.description} maxLength={400} onChange={set('description')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Language" value={f.language} maxLength={40} onChange={set('language')} />
          <Input label="Max members (2 to 50)" type="number" min="2" max="50" value={f.maxMembers} onChange={set('maxMembers')} />
        </div>
        <Select label="Who can find this group" value={f.audience} onChange={set('audience')} options={[{ value: 'friends', label: 'Only my Connect friends' }, { value: 'everyone', label: 'Everyone in LifeOS' }]} />
        <p className="text-xs text-slate-500">Do not put phone numbers, emails or links here. People ask to join and you decide. The group chat lives in Connect.</p>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={f.title.trim().length < 3} onClick={save}>Create group</Button></div>
    </Modal>
  );
}

function Requests({ onChanged }) {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { data, err, load } = useList(() => communityApi.requests(), []);
  const [busy, setBusy] = useState('');
  if (!data) return <div className="flex justify-center py-10"><Spinner /></div>;
  const incoming = data.incoming || [];
  const outgoing = data.outgoing || [];
  const respond = async (r, action) => {
    setBusy(r.id);
    try {
      const res = await communityApi.respond(r.id, action);
      addToast(action === 'accept' ? 'Accepted. You can chat in Connect.' : 'Declined');
      await load(); onChanged();
      if (action === 'accept' && res.data.conversationId) navigate(`/connect/chats/${res.data.conversationId}`);
    } catch (e) { addToast(formatApiError(e), 'error'); load(); } finally { setBusy(''); }
  };
  const cancel = async (r) => { try { await communityApi.cancel(r.id); load(); } catch (e) { addToast(formatApiError(e), 'error'); } };
  const label = (r) => (r.kind === 'group' ? `wants to join "${r.groupTitle}"` : r.kind === 'impact' ? `is interested in "${r.groupTitle}"` : 'asked for a mentoring session');
  return (
    <div className="space-y-5">
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      <section aria-label="Requests to you" className="space-y-2">
        <h2 className="text-sm font-semibold">Waiting for your answer</h2>
        {incoming.length === 0 ? <p className="text-sm text-slate-500">Nothing waiting.</p> : incoming.map((r) => (
          <Card key={r.id} className="space-y-2 p-4">
            <p className="text-sm"><strong>{r.otherName}</strong> {label(r)}</p>
            {r.message && <p className="text-sm text-slate-600 dark:text-slate-300">"{r.message}"</p>}
            <p className="text-xs text-slate-500">If you accept, you become Connect friends and can chat there.</p>
            <div className="flex gap-2"><Button size="sm" loading={busy === r.id} onClick={() => respond(r, 'accept')}>Accept</Button><Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => respond(r, 'decline')}>Decline</Button></div>
          </Card>
        ))}
      </section>
      <section aria-label="Requests you sent" className="space-y-2">
        <h2 className="text-sm font-semibold">Sent by you</h2>
        {outgoing.length === 0 ? <p className="text-sm text-slate-500">You have not sent any requests.</p> : outgoing.map((r) => (
          <Card key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
            <p className="text-sm">To <strong>{r.otherName}</strong>: {r.kind === 'group' ? `join "${r.groupTitle}"` : r.kind === 'impact' ? `help with "${r.groupTitle}"` : 'mentoring session'}</p>
            <div className="flex items-center gap-2">
              <Badge variant={r.status === 'accepted' ? 'success' : r.status === 'pending' ? 'info' : 'warning'}>{r.status}</Badge>
              {r.status === 'pending' && <Button size="sm" variant="ghost" onClick={() => cancel(r)}>Cancel</Button>}
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}

function Profile({ initial, onSaved }) {
  const { addToast } = useToast();
  const [f, setF] = useState({ ...initial, offers: initial.offers.join(', '), wants: initial.wants.join(', ') });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = async () => {
    setBusy(true); setError('');
    try {
      await communityApi.saveProfile({ enabled: f.enabled, displayName: f.displayName, intro: f.intro, offers: csv(f.offers), wants: csv(f.wants), language: f.language, availability: f.availability, audience: f.audience });
      addToast('Profile saved');
      onSaved();
    } catch (e) { setError(formatApiError(e)); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-wrap items-start gap-4">
      <Card className="min-w-[18rem] flex-1 space-y-3 p-5">
        <label className="flex items-center justify-between gap-3">
          <span><span className="block font-medium">Show me in Community</span><span className="text-sm text-slate-500">Currently: {f.enabled ? 'visible' : 'hidden'}{initial.hidden ? ' (hidden pending admin review)' : ''}</span></span>
          <input type="checkbox" className="h-5 w-5" checked={Boolean(f.enabled)} onChange={(e) => setF((s) => ({ ...s, enabled: e.target.checked }))} />
        </label>
        <Input label="Display name (not your account name)" value={f.displayName} maxLength={40} onChange={set('displayName')} />
        <Textarea label="Short intro" value={f.intro} maxLength={300} onChange={set('intro')} />
        <Input label="Skills I can offer (separate with commas)" value={f.offers} onChange={set('offers')} />
        <Input label="Skills I want to learn (separate with commas)" value={f.wants} onChange={set('wants')} />
        <div className="grid grid-cols-2 gap-3"><Input label="Language" value={f.language} maxLength={40} onChange={set('language')} /><Input label="Availability" value={f.availability} maxLength={80} onChange={set('availability')} /></div>
        <Select label="Who can see my profile" value={f.audience} onChange={set('audience')} options={[{ value: 'friends', label: 'Only my Connect friends' }, { value: 'everyone', label: 'Everyone in LifeOS' }]} />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <Button loading={busy} onClick={save}>Save</Button>
      </Card>
      <Card className="min-w-[16rem] flex-1 space-y-2 border-indigo-200 bg-indigo-50 p-5 text-sm text-indigo-900 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-100">
        <p className="font-semibold">What other people can and cannot see</p>
        <p><strong>Can see, only if you switch on:</strong> display name, skills, language, availability and the intro you wrote.</p>
        <p><strong>Never shown:</strong> your email, phone, account name, goals, tasks, notes, documents, meetings, money or Connect chats.</p>
        <p><strong>Contact:</strong> only through Connect, after you accept a request. You can block or report anyone at any time. You can switch your profile off whenever you like.</p>
        <p className="flex items-center gap-1 text-xs"><Ban className="h-3.5 w-3.5" /> Contact details written in these fields are rejected automatically.</p>
      </Card>
    </div>
  );
}
