import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Copy, Pencil, Check, X, Loader2, FileText, Upload } from 'lucide-react';
import { Button, EmptyState, Textarea } from '../ui.jsx';
import { lineClock, speakerName, clock } from '../../utils/meetingFormat.js';
import { useToast } from '../../context/ToastContext.jsx';

const COLORS = ['text-indigo-600', 'text-emerald-600', 'text-rose-600', 'text-amber-600', 'text-sky-600', 'text-fuchsia-600'];
const colorFor = (label = '') => COLORS[Math.abs([...label].reduce((h, c) => h * 31 + c.charCodeAt(0), 0)) % COLORS.length];

/**
 * Transcript list with search, copy, edit, timestamps, speaker labels and click-to-seek.
 * `activeMs` highlights the line being played; `jumpSeq` scrolls to and flashes a line.
 */
export default function TranscriptView({
  segments,
  loading,
  startedAt,
  activeMs,
  jumpSeq,
  canEdit,
  hasMore,
  onLoadMore,
  onSearch,
  onSeek,
  onEdit,
  onImport,
  live = false,
  emptyHint,
}) {
  const { addToast } = useToast();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // { seq, text }
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const endRef = useRef(null);
  const refs = useRef(new Map());

  // Debounced server-side search.
  useEffect(() => {
    if (!onSearch) return undefined;
    const t = setTimeout(() => onSearch(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q, onSearch]);

  // Live mode: keep the newest line in view.
  useEffect(() => {
    if (live && !q) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [segments.length, live, q]);

  useEffect(() => {
    if (jumpSeq == null) return;
    const el = refs.current.get(jumpSeq);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-indigo-400');
      setTimeout(() => el.classList.remove('ring-2', 'ring-indigo-400'), 2000);
    }
  }, [jumpSeq, segments.length]);

  const activeSeq = useMemo(() => {
    if (activeMs == null) return null;
    let found = null;
    for (const s of segments) {
      if (s.startMs <= activeMs) found = s.seq;
      else break;
    }
    return found;
  }, [activeMs, segments]);

  const copyAll = async () => {
    const text = segments.map((s) => `[${clock(s.startMs)}] ${speakerName(s)}: ${s.text}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      addToast('Transcript copied');
    } catch {
      addToast('Copy failed — your browser blocked clipboard access', 'error');
    }
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await onEdit(editing.seq, { text: editing.text.trim() });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Search transcript</span>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search transcript…"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
          />
        </label>
        <Button variant="secondary" icon={Copy} onClick={copyAll} disabled={!segments.length}>Copy</Button>
      </div>

      {loading && !segments.length ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
      ) : segments.length === 0 ? (
        <div>
          <EmptyState
            icon={FileText}
            title={q ? 'No matching lines' : 'No transcript yet'}
            description={q ? 'Try a different word.' : emptyHint || 'A transcript appears here once speech has been transcribed.'}
            action={!q && canEdit && onImport ? <Button variant="secondary" icon={Upload} onClick={() => setImportOpen((v) => !v)}>Paste a transcript</Button> : null}
          />
          {importOpen && (
            <div className="space-y-2">
              <Textarea label="One line per utterance. Use “Name: text” to label speakers." rows={8} value={importText} onChange={(e) => setImportText(e.target.value)} />
              <Button onClick={async () => { await onImport(importText); setImportOpen(false); setImportText(''); }} disabled={!importText.trim()}>Import transcript</Button>
            </div>
          )}
        </div>
      ) : (
        <ol className="space-y-1.5" aria-live={live ? 'polite' : 'off'}>
          {segments.map((s) => {
            const isEditing = editing?.seq === s.seq;
            return (
              <li
                key={s.seq}
                ref={(el) => (el ? refs.current.set(s.seq, el) : refs.current.delete(s.seq))}
                style={{ contentVisibility: 'auto', containIntrinsicSize: '0 64px' }}
                className={`group rounded-xl px-3 py-2.5 transition-colors ${activeSeq === s.seq ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
              >
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => onSeek?.(s.startMs)}
                    disabled={!onSeek}
                    className="tabular-nums font-semibold text-slate-500 hover:text-indigo-600 disabled:hover:text-slate-500 disabled:cursor-default"
                    aria-label={onSeek ? `Play from ${clock(s.startMs)}` : `Time ${clock(s.startMs)}`}
                    title={onSeek ? 'Jump to this moment' : undefined}
                  >
                    {lineClock(startedAt, s.startMs)}
                  </button>
                  <span className="text-slate-300" aria-hidden="true">—</span>
                  <span className={`font-bold ${colorFor(s.speakerLabel)}`}>{speakerName(s)}</span>
                  {s.edited && <span className="text-[10px] text-slate-400">edited</span>}
                  {canEdit && onEdit && !isEditing && (
                    <button type="button" onClick={() => setEditing({ seq: s.seq, text: s.text })} className="ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-indigo-600" aria-label="Edit line">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {isEditing ? (
                  <div className="mt-1 space-y-2">
                    <textarea value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} rows={3} maxLength={5000} className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-sm dark:text-white" />
                    <div className="flex gap-2">
                      <Button size="sm" icon={Check} loading={saving} onClick={saveEdit} disabled={!editing.text.trim()}>Save</Button>
                      <Button size="sm" variant="secondary" icon={X} onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-800 dark:text-slate-200">{s.text}</p>
                )}
              </li>
            );
          })}
          <li ref={endRef} aria-hidden="true" />
        </ol>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={onLoadMore} loading={loading}>Load more</Button>
        </div>
      )}
    </div>
  );
}
