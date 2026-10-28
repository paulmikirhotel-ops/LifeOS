import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserPlus, Users, Check, X, MessageCircle, Clock, UserMinus, Loader2 } from 'lucide-react';
import { Button, Card, EmptyState, ConfirmDialog } from '../../components/ui.jsx';
import { PrivacyCard } from '../../components/connect/Safety.jsx';
import Avatar from '../../components/connect/Avatar.jsx';
import { useConnect } from '../../context/ConnectContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { connectApi } from '../../api/connect.js';
import { formatApiError } from '../../utils/errors.js';

function Row({ person, children, sub }) {
  return (
    <li className="flex min-h-[64px] items-center gap-3 px-3 py-2.5">
      <Avatar name={person.name} online={person.online} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-900 dark:text-white">{person.name}</p>
        {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </li>
  );
}

const iconBtn = 'flex h-10 w-10 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60';

/** Friends, requests and people search, all backed by the real server. */
export default function FriendsPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { friends, friendActions, openWith, ready } = useConnect();
  const [tab, setTab] = useState('friends');
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(null);

  const run = async (key, fn, okMsg) => {
    setBusy(key);
    try { await fn(); if (okMsg) addToast(okMsg); } catch (err) { addToast(formatApiError(err), 'error'); } finally { setBusy(''); }
  };

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); setSearching(false); return undefined; }
    setSearching(true);
    let alive = true;
    const t = setTimeout(() => {
      connectApi.search(term).then((r) => alive && setResults(r.data.items)).catch((err) => alive && addToast(formatApiError(err), 'error')).finally(() => alive && setSearching(false));
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const message = (userId) => run(`m-${userId}`, async () => { const conv = await openWith(userId); navigate(`/connect/chats/${conv.id}`); });
  const requests = friends.incoming.length;
  const TABS = [['friends', 'Friends', friends.friends.length], ['requests', 'Requests', requests], ['find', 'Find people', 0]];

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Friends" className="inline-flex max-w-full overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {TABS.map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold transition-colors ${tab === k ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-sky-400' : 'text-slate-500'}`}>
            {label}{k === 'requests' && n > 0 && <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">{n}</span>}
          </button>
        ))}
      </div>

      {tab === 'find' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <label htmlFor="find-people" className="sr-only">Search LifeOS users</label>
            <input id="find-people" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, or type someone's full email"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-10 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900" />
            {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" aria-label="Searching" />}
          </div>
          <Card className="p-2">
            {results === null
              ? <EmptyState icon={Search} title="Find people" description="Type at least two letters of a name. Only people who allow it can be found." />
              : results.length === 0
                ? <EmptyState icon={Users} title="No one found" description="Check the spelling, or ask them for the e-mail they signed up with." />
                : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {results.map((p) => (
                      <Row key={p.id} person={p}>
                        {p.relation === 'none' && <Button icon={UserPlus} loading={busy === `r-${p.id}`} className="min-h-[40px] !bg-blue-600 hover:!bg-blue-700 !text-white" onClick={() => run(`r-${p.id}`, async () => { await friendActions.request(p.id); setResults((r) => r.map((x) => (x.id === p.id ? { ...x, relation: 'outgoing' } : x))); }, 'Request sent')}>Add</Button>}
                        {p.relation === 'outgoing' && <span className="inline-flex items-center gap-1.5 text-sm text-slate-500"><Clock className="h-4 w-4" aria-hidden="true" />Request sent</span>}
                        {p.relation === 'incoming' && <Button loading={busy === `a-${p.requestId}`} className="min-h-[40px] !bg-blue-600 hover:!bg-blue-700 !text-white" onClick={() => run(`a-${p.requestId}`, async () => { await friendActions.accept(p.requestId); setResults((r) => r.map((x) => (x.id === p.id ? { ...x, relation: 'friend' } : x))); }, 'You are now friends')}>Accept</Button>}
                        {p.relation === 'friend' && <Button icon={MessageCircle} className="min-h-[40px] !bg-blue-600 hover:!bg-blue-700 !text-white" onClick={() => message(p.id)}>Message</Button>}
                      </Row>
                    ))}
                  </ul>
                )}
          </Card>
        </div>
      )}

      {tab === 'friends' && (
        <Card className="p-2">
          {!ready ? <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
            : friends.friends.length === 0
              ? <EmptyState icon={Users} title="No friends yet" description="Use Find people to search for someone on LifeOS and send a request." action={<Button className="!bg-blue-600 hover:!bg-blue-700 !text-white" onClick={() => setTab('find')}>Find people</Button>} />
              : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {friends.friends.map((p) => (
                    <Row key={p.id} person={p} sub={p.online ? 'Online' : 'Offline'}>
                      <button type="button" className={`${iconBtn} bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-sky-400`} aria-label={`Message ${p.name}`} disabled={busy === `m-${p.id}`} onClick={() => message(p.id)}><MessageCircle className="h-5 w-5" /></button>
                      <button type="button" className={`${iconBtn} text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800`} aria-label={`Remove ${p.name}`} onClick={() => setConfirm(p)}><UserMinus className="h-5 w-5" /></button>
                    </Row>
                  ))}
                </ul>
              )}
        </Card>
      )}

      {tab === 'requests' && (
        <div className="space-y-4">
          <Card className="p-2">
            <h2 className="px-3 pb-1 pt-2 text-sm font-bold text-slate-900 dark:text-white">Received</h2>
            {friends.incoming.length === 0 ? <p className="px-3 pb-3 text-sm text-slate-500">No new requests.</p> : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {friends.incoming.map((p) => (
                  <Row key={p.requestId} person={p}>
                    <button type="button" className={`${iconBtn} bg-blue-600 text-white hover:bg-blue-700`} aria-label={`Accept ${p.name}`} disabled={busy === `a-${p.requestId}`} onClick={() => run(`a-${p.requestId}`, () => friendActions.accept(p.requestId), 'You are now friends')}><Check className="h-5 w-5" /></button>
                    <button type="button" className={`${iconBtn} bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300`} aria-label={`Decline ${p.name}`} disabled={busy === `d-${p.requestId}`} onClick={() => run(`d-${p.requestId}`, () => friendActions.decline(p.requestId))}><X className="h-5 w-5" /></button>
                  </Row>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-2">
            <h2 className="px-3 pb-1 pt-2 text-sm font-bold text-slate-900 dark:text-white">Sent</h2>
            {friends.outgoing.length === 0 ? <p className="px-3 pb-3 text-sm text-slate-500">You have no pending requests.</p> : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {friends.outgoing.map((p) => (
                  <Row key={p.requestId} person={p} sub="Waiting for a reply">
                    <Button variant="secondary" className="min-h-[40px]" loading={busy === `c-${p.id}`} onClick={() => run(`c-${p.id}`, () => friendActions.remove(p.id))}>Cancel</Button>
                  </Row>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <PrivacyCard />

      <ConfirmDialog open={Boolean(confirm)} danger title={`Remove ${confirm?.name || ''}?`} description="You will no longer be able to message each other. Your past messages stay saved."
        confirmLabel="Remove" onClose={() => setConfirm(null)}
        onConfirm={() => { const p = confirm; setConfirm(null); run(`x-${p.id}`, () => friendActions.remove(p.id), 'Friend removed'); }} />
    </div>
  );
}
