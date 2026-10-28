import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Plus, Pin, PinOff, Pencil, Trash2, ExternalLink, StickyNote, Link2, Lightbulb } from 'lucide-react';
import { lifeApi, describeAnswer } from '../../api/life.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useTenant } from '../../context/TenantContext.jsx';
import { formatApiError } from '../../utils/errors.js';
import { Button, Card, Input, Select, Textarea, Spinner, EmptyState, Modal, Badge } from '../../components/ui.jsx';

const KIND = { note: { label: 'Note', icon: StickyNote }, link: { label: 'Link', icon: Link2 }, lesson: { label: 'Lesson', icon: Lightbulb } };
const blank = { kind: 'note', title: '', body: '', url: '', tags: '' };

export default function KnowledgeTab() {
  const { addToast } = useToast();
  const { can } = useTenant();
  const canWrite = can('goals.create');
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [kind, setKind] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null); // null = closed, {id?, ...fields}
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async (params) => {
    try {
      setError('');
      const d = await lifeApi.entries(params);
      if (!d || !Array.isArray(d.entries) || !Array.isArray(d.tags)) throw new Error(`Unexpected answer from the server (${describeAnswer(d)}).`);
      setData(d);
    } catch (e) { setError(e?.response ? formatApiError(e) : String(e?.message || e)); }
  }, []);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => load({ q: q || undefined, tag: tag || undefined, kind: kind || undefined }), q ? 300 : 0);
    return () => clearTimeout(timer.current);
  }, [q, tag, kind, load]);

  const refresh = () => load({ q: q || undefined, tag: tag || undefined, kind: kind || undefined });
  const act = async (fn, ok) => { setBusy(true); try { await fn(); if (ok) addToast(ok); await refresh(); return true; } catch (e) { addToast(formatApiError(e)); return false; } finally { setBusy(false); } };

  const save = async (e) => {
    e.preventDefault();
    const body = { kind: form.kind, title: form.title, body: form.body, url: form.url, tags: form.tags.split(/[,\s]+/).filter(Boolean) };
    const done = await act(() => (form.id ? lifeApi.updateEntry(form.id, body) : lifeApi.addEntry(body)), form.id ? 'Saved' : 'Added');
    if (done) setForm(null);
  };

  if (error) return <Card className="p-4 text-red-700 dark:text-red-300">{error} <Button variant="secondary" onClick={refresh}>Try again</Button></Card>;
  if (!data) return <div className="flex justify-center p-8"><Spinner /></div>;

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[10rem]">
            <Input label="Search your knowledge" value={q} onChange={(e) => setQ(e.target.value)} placeholder="words in a title, note, tag or link" />
          </div>
          <div className="w-36">
            <Select label="Type" value={kind} onChange={(e) => setKind(e.target.value)} options={[{ value: '', label: 'All' }, { value: 'note', label: 'Notes' }, { value: 'link', label: 'Links' }, { value: 'lesson', label: 'Lessons' }]} />
          </div>
          {canWrite && <Button icon={Plus} onClick={() => setForm({ ...blank })}>Add</Button>}
        </div>
        {data.tags.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Filter by tag">
            {tag && <Button size="sm" variant="ghost" onClick={() => setTag('')}>Clear tag</Button>}
            {data.tags.map((t) => (
              <button key={t.tag} type="button" onClick={() => setTag(tag === t.tag ? '' : t.tag)} aria-pressed={tag === t.tag}
                className={`text-xs rounded-full px-3 py-1 border ${tag === t.tag ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'}`}>
                #{t.tag} · {t.count}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">{data.total} of {data.max} entries. Only you can see them.</p>
      </Card>

      {data.entries.length === 0 ? (
        <Card className="p-4"><EmptyState icon={Search} title={q || tag || kind ? 'Nothing matches' : 'Nothing saved yet'} description={q || tag || kind ? 'Try fewer words or clear the filters.' : 'Save a note, a useful link, or a lesson you learned. You can search them later.'} action={canWrite && !(q || tag || kind) ? <Button icon={Plus} onClick={() => setForm({ ...blank })}>Add your first</Button> : null} /></Card>
      ) : (
        <ul className="space-y-3">
          {data.entries.map((e) => {
            const K = KIND[e.kind] || KIND.note;
            const Icon = K.icon;
            return (
              <li key={e._id}>
                <Card className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{K.label}{e.pinned && <Badge variant="info">Pinned</Badge>}</div>
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100 break-words">{e.title}</h3>
                    </div>
                    {canWrite && (
                      <div className="flex shrink-0">
                        <Button variant="ghost" aria-label={e.pinned ? 'Unpin' : 'Pin'} onClick={() => act(() => lifeApi.updateEntry(e._id, { pinned: !e.pinned }))}>{e.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}</Button>
                        <Button variant="ghost" aria-label="Edit" onClick={() => setForm({ id: e._id, kind: e.kind, title: e.title, body: e.body || '', url: e.url || '', tags: (e.tags || []).join(' ') })}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" aria-label="Delete" onClick={() => { if (window.confirm(`Delete "${e.title}"?`)) act(() => lifeApi.removeEntry(e._id), 'Deleted'); }}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    )}
                  </div>
                  {e.body && <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{e.body}</p>}
                  {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="text-sm text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1 break-all"><ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{(() => { try { return new URL(e.url).hostname; } catch { return e.url; } })()}</a>}
                  {e.tags?.length > 0 && <div className="flex flex-wrap gap-1">{e.tags.map((t) => <button key={t} type="button" onClick={() => setTag(t)} className="text-xs text-slate-600 dark:text-slate-400 underline">#{t}</button>)}</div>}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Modal isOpen={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit entry' : 'Add to Knowledge'}>
        {form && (
          <form className="space-y-3" onSubmit={save}>
            <Select label="Type" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} options={[{ value: 'note', label: 'Note' }, { value: 'link', label: 'Link' }, { value: 'lesson', label: 'Lesson learned' }]} />
            <Input label="Title" value={form.title} maxLength={160} required onChange={(e) => setForm({ ...form, title: e.target.value })} />
            {(form.kind === 'link' || form.url) && <Input label={form.kind === 'link' ? 'Web address' : 'Web address (optional)'} type="url" value={form.url} maxLength={500} required={form.kind === 'link'} onChange={(e) => setForm({ ...form, url: e.target.value })} />}
            <Textarea label="Details (optional)" rows={5} value={form.body} maxLength={5000} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            <Input label="Tags (separate with spaces or commas)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
              <Button type="submit" loading={busy} disabled={!form.title.trim()}>Save</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
