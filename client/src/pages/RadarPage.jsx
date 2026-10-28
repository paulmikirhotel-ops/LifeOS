import React, { useCallback, useEffect, useState } from 'react';
import { Radar, Plus, Bookmark, BookmarkCheck, X, ExternalLink, CalendarPlus, Sparkles, RefreshCw, ShieldAlert, Trash2, Rss, Clock } from 'lucide-react';
import { radarApi } from '../api/radar.js';
import { isLowData } from '../offline/status.js';
import { useToast } from '../context/ToastContext.jsx';
import { useTenant } from '../context/TenantContext.jsx';
import { formatApiError } from '../utils/errors.js';
import { Button, Card, Badge, Spinner, Modal, Input, Select, EmptyState } from '../components/ui.jsx';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'job', label: 'Jobs' },
  { key: 'scholarship', label: 'Scholarships' },
  { key: 'grant', label: 'Grants' },
  { key: 'other', label: 'Other' },
];
const TYPE_LABEL = { job: 'Job', scholarship: 'Scholarship', grant: 'Grant', other: 'Other' };
const niceDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const ago = (d) => {
  if (!d) return 'never';
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};

export default function RadarPage() {
  const { addToast } = useToast();
  const { can } = useTenant();
  const canWrite = can('goals.create');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [closing, setClosing] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [taskFor, setTaskFor] = useState(null); // item awaiting the person's confirmation
  const [busyId, setBusyId] = useState('');
  const [kwText, setKwText] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await radarApi.feed({ type: filter, closing: closing ? 1 : undefined, saved: savedOnly ? 1 : undefined });
      setData(res.data);
      setKwText((cur) => (cur === '' ? res.data.keywords.join(', ') : cur));
      setLoadError('');
    } catch (err) {
      setLoadError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [filter, closing, savedOnly]);

  useEffect(() => {
    load();
  }, [load]);

  // On first open, top up feeds that are older than 5 minutes (the server skips fresh ones).
  useEffect(() => {
    let alive = true;
    if (isLowData()) return undefined; // low-data mode: refresh only when the person presses Refresh
    radarApi.refresh().then(() => alive && load()).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshNow = async () => {
    setRefreshing(true);
    try {
      const res = await radarApi.refresh({ force: true });
      const failed = res.data.results.filter((r) => r.ok === false).length;
      addToast(failed ? `${failed} feed(s) could not be refreshed. See Sources.` : 'Feeds refreshed');
      await load();
    } catch (err) {
      addToast(formatApiError(err), 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const patchItem = (id, fn) => setData((d) => ({ ...d, items: d.items.map((i) => (i._id === id ? fn(i) : i)) }));

  const toggleSave = async (item) => {
    const next = item.state === 'saved' ? 'new' : 'saved';
    try {
      await radarApi.setState(item._id, next);
      patchItem(item._id, (i) => ({ ...i, state: next }));
    } catch (err) {
      addToast(formatApiError(err), 'error');
    }
  };
  const dismiss = async (item) => {
    try {
      await radarApi.setState(item._id, 'dismissed');
      setData((d) => ({ ...d, items: d.items.filter((i) => i._id !== item._id) }));
    } catch (err) {
      addToast(formatApiError(err), 'error');
    }
  };
  const confirmTask = async () => {
    const item = taskFor;
    setBusyId(item._id);
    try {
      const res = await radarApi.addTask(item._id);
      patchItem(item._id, (i) => ({ ...i, taskId: res.data.taskId }));
      addToast(res.data.already ? 'Already in your tasks' : 'Added to your tasks');
      setTaskFor(null);
    } catch (err) {
      addToast(formatApiError(err), 'error');
    } finally {
      setBusyId('');
    }
  };
  const explain = async (item) => {
    setBusyId(item._id);
    try {
      const res = await radarApi.explain(item._id);
      patchItem(item._id, (i) => ({ ...i, why: res.data.why }));
      setData((d) => ({ ...d, usage: res.data.usage }));
    } catch (err) {
      addToast(formatApiError(err), 'error');
    } finally {
      setBusyId('');
    }
  };
  const saveKeywords = async () => {
    try {
      const list = kwText.split(',').map((s) => s.trim()).filter(Boolean);
      const res = await radarApi.saveProfile(list);
      setKwText(res.data.keywords.join(', '));
      addToast('Keywords saved');
      await load();
    } catch (err) {
      addToast(formatApiError(err), 'error');
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (loadError && !data) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-red-600">{loadError}</p>
        <Button className="mt-3" onClick={() => { setLoading(true); load(); }}>Try again</Button>
      </Card>
    );
  }

  const counts = data.counts;
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Radar className="h-6 w-6" /> Opportunity Radar</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Jobs, scholarships and grants from the feeds you follow. Nothing here is verified by LifeOS.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={refreshNow} disabled={!data.hasSources}>Refresh</Button>
          <Button icon={Rss} onClick={() => setSourcesOpen(true)}>Sources</Button>
        </div>
      </header>

      <div role="note" className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Always check the official site before you apply. A real opportunity never asks you to pay to apply.</span>
      </div>

      <Card className="p-4">
        <div className="flex items-end gap-2">
          <Input label="What are you looking for? (keywords, separated by commas)" className="flex-1" value={kwText} onChange={(e) => setKwText(e.target.value)} placeholder="react, design, nursing, scholarship" disabled={!canWrite} />
          {canWrite && <Button variant="secondary" onClick={saveKeywords}>Save</Button>}
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Items are ranked by simple keyword matches in the title and summary. Matches are shown on each card.</p>
      </Card>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter opportunities">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-sm ${filter === f.key ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 text-slate-700 dark:text-slate-200'}`}>
            {f.label}{f.key !== 'all' ? ` ${counts[f.key]}` : ` ${counts.all}`}
          </button>
        ))}
        <button onClick={() => setClosing((v) => !v)} aria-pressed={closing}
          className={`rounded-full border px-3 py-1 text-sm ${closing ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 text-slate-700 dark:text-slate-200'}`}>
          <Clock className="mr-1 inline h-3.5 w-3.5" /> Closing soon {counts.closing}
        </button>
        <button onClick={() => setSavedOnly((v) => !v)} aria-pressed={savedOnly}
          className={`rounded-full border px-3 py-1 text-sm ${savedOnly ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 text-slate-700 dark:text-slate-200'}`}>
          <Bookmark className="mr-1 inline h-3.5 w-3.5" /> Saved {counts.saved}
        </button>
      </div>

      {!data.hasSources ? (
        <EmptyState icon={Rss} title="Add your first feed"
          description="Radar reads public RSS or Atom feeds that you choose, for example a company careers feed or a scholarship site. It does not search the whole internet."
          action={<Button icon={Plus} onClick={() => setSourcesOpen(true)}>Add a feed</Button>} />
      ) : data.items.length === 0 ? (
        <EmptyState icon={Radar} title="Nothing to show"
          description={savedOnly ? 'You have not saved anything yet.' : 'No open opportunities match these filters. Expired items are hidden automatically.'} />
      ) : (
        <ul className="space-y-3">
          {data.items.map((it) => (
            <li key={it._id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="info">{TYPE_LABEL[it.type]}{it.typeGuessed ? ' (guessed from keywords)' : ''}</Badge>
                      {it.deadline ? (
                        <Badge variant={it.closingSoon ? 'warning' : 'success'}>
                          Deadline {niceDate(it.deadline)}{it.daysLeft != null ? ` · ${it.daysLeft === 0 ? 'today' : `${it.daysLeft} d left`}` : ''}
                        </Badge>
                      ) : <span className="text-xs text-slate-500 dark:text-slate-400">No deadline listed</span>}
                      {it.matched.map((k) => <Badge key={k} variant="info">{k}</Badge>)}
                    </div>
                    <h2 className="text-base font-medium leading-snug">{it.title}</h2>
                    {it.summary && <p className="mt-1 line-clamp-3 text-sm text-slate-600 dark:text-slate-300">{it.summary}</p>}
                    {it.why && <p className="mt-2 rounded bg-indigo-50 p-2 text-sm text-indigo-900 dark:bg-indigo-900/30 dark:text-indigo-100"><Sparkles className="mr-1 inline h-3.5 w-3.5" />{it.why}</p>}
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Links to <strong>{it.domain}</strong> · from {it.sourceName || 'your feed'} · fetched {ago(it.fetchedAt)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={it.link} target="_blank" rel="noopener noreferrer nofollow"
                    className="inline-flex items-center rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                    <ExternalLink className="mr-1 h-4 w-4" /> Open official page
                  </a>
                  <Button size="sm" variant="secondary" icon={it.state === 'saved' ? BookmarkCheck : Bookmark} onClick={() => toggleSave(it)}>{it.state === 'saved' ? 'Saved' : 'Save'}</Button>
                  <Button size="sm" variant="secondary" icon={X} onClick={() => dismiss(it)}>Not for me</Button>
                  {canWrite && it.deadline && (it.taskId
                    ? <span className="inline-flex items-center px-2 text-sm text-green-700">Deadline is in your tasks</span>
                    : <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => setTaskFor(it)}>Add deadline to tasks</Button>)}
                  {data.aiConfigured && data.keywords.length > 0 && !it.why && (
                    <Button size="sm" variant="ghost" icon={Sparkles} loading={busyId === it._id} disabled={data.usage.left === 0} onClick={() => explain(it)}>{data.usage.left === 0 ? 'Explanation limit reached today' : 'Why this match?'}</Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {taskFor && (
        <Modal isOpen onClose={() => setTaskFor(null)} title="Add deadline to your tasks?">
          <p className="text-sm text-slate-700 dark:text-slate-200">This creates one task, "Apply: {taskFor.title}", due {niceDate(taskFor.deadline)}. The deadline comes from the feed, so check it on the official page.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTaskFor(null)}>Cancel</Button>
            <Button loading={busyId === taskFor._id} onClick={confirmTask}>Add task</Button>
          </div>
        </Modal>
      )}

      {sourcesOpen && <SourcesModal canWrite={canWrite} onClose={() => { setSourcesOpen(false); load(); }} />}
    </div>
  );
}

function SourcesModal({ canWrite, onClose }) {
  const { addToast } = useToast();
  const [list, setList] = useState(null);
  const [max, setMax] = useState(10);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await radarApi.sources();
      setList(res.data.items);
      setMax(res.data.max);
    } catch (err) {
      setError(formatApiError(err));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await radarApi.addSource({ url: url.trim(), name: name.trim() || undefined, type });
      addToast(`Feed added: ${res.data.found} items found`);
      setUrl(''); setName(''); setType('auto');
      await load();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (s) => {
    if (!window.confirm(`Stop following "${s.name}" and remove its items?`)) return;
    try {
      await radarApi.removeSource(s._id);
      await load();
    } catch (err) {
      addToast(formatApiError(err), 'error');
    }
  };
  const retype = async (s, t) => {
    try {
      await radarApi.updateSource(s._id, { type: t });
      await load();
    } catch (err) {
      addToast(formatApiError(err), 'error');
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Sources">
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">Add the address of a public RSS or Atom feed (https only). It is tested before it is saved. LifeOS only reads the feed; it never logs in or posts anywhere.</p>
      {canWrite && (
        <form onSubmit={add} className="mb-4 space-y-2">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.org/careers/feed.xml" aria-label="Feed address" required />
          <div className="flex flex-wrap gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" aria-label="Feed name" className="min-w-[8rem] flex-1" />
            <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type of opportunities in this feed" options={[
              { value: 'auto', label: 'Guess type from keywords' }, { value: 'job', label: 'All jobs' }, { value: 'scholarship', label: 'All scholarships' },
              { value: 'grant', label: 'All grants' }, { value: 'other', label: 'All other' }]} />
            <Button type="submit" loading={busy} disabled={!url.trim() || (list?.length ?? 0) >= max}>{busy ? 'Testing…' : 'Add feed'}</Button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
      {!list ? <Spinner /> : list.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No feeds yet. Tip: many sites show an RSS or Feed link, or you can try adding /feed to the site address.</p>
      ) : (
        <ul className="divide-y">
          {list.map((s) => (
            <li key={s._id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{s.name}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{s.url}</p>
                <p className={`text-xs ${s.lastError ? 'text-red-600' : 'text-slate-500 dark:text-slate-400'}`}>
                  {s.lastError || `${s.itemCount} items · updated ${ago(s.lastFetchedAt)}`}
                </p>
              </div>
              {canWrite && (
                <div className="flex items-center gap-2">
                  <Select value={s.type} onChange={(e) => retype(s, e.target.value)} aria-label={`Type for ${s.name}`} options={[
                    { value: 'auto', label: 'Guess' }, { value: 'job', label: 'Jobs' }, { value: 'scholarship', label: 'Scholarships' },
                    { value: 'grant', label: 'Grants' }, { value: 'other', label: 'Other' }]} />
                  <Button variant="ghost" onClick={() => remove(s)} aria-label={`Remove ${s.name}`}><Trash2 className="h-4 w-4" /></Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{list?.length ?? 0} of {max} feeds used.</p>
    </Modal>
  );
}
