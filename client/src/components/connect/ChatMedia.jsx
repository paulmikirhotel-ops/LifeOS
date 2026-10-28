import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '../ui.jsx';
import { Lightbox, MediaThumb, FileCard } from './Attachments.jsx';
import { connectApi } from '../../api/connect.js';
import { formatApiError } from '../../utils/errors.js';
import { listTime } from '../../utils/connectFormat.js';

const TABS = [['media', 'Photos & videos'], ['docs', 'Files & voice notes']];

/** Everything shared in ONE chat: photos and videos in a grid, files and voice notes in a list. */
export default function ChatMediaModal({ open, onClose, conversationId, title }) {
  const [type, setType] = useState('media');
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async (before) => {
    setLoading(true); setError('');
    try {
      const r = await connectApi.sharedFiles({ type, conversationId, ...(before ? { before } : {}) });
      setItems((prev) => (before ? [...prev, ...r.data.items] : r.data.items));
      setHasMore(r.data.hasMore);
    } catch (err) { setError(formatApiError(err)); } finally { setLoading(false); }
  }, [type, conversationId]);

  useEffect(() => { if (open) { setItems([]); load(); } }, [open, load]);

  return (
    <>
      <Modal isOpen={open} onClose={onClose} title={`Media & files${title ? ` · ${title}` : ''}`}>
        <div className="space-y-3">
          <div role="tablist" aria-label="Types" className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {TABS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={type === k} onClick={() => setType(k)} className={`min-h-[40px] whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${type === k ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-sky-400' : 'text-slate-500'}`}>{label}</button>
            ))}
          </div>
          {error ? <p className="py-6 text-center text-sm text-slate-500">{error}</p>
            : items.length === 0 && !loading ? <p className="py-8 text-center text-sm text-slate-500">{type === 'media' ? 'No photos or videos in this chat yet.' : 'No files or voice notes in this chat yet.'}</p>
              : type === 'media' ? (
                <ul className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto">
                  {items.map((m) => <li key={m.id}><MediaThumb m={m} tile onOpen={setViewing} /><p className="mt-0.5 truncate text-[11px] text-slate-500">{listTime(m.at)}</p></li>)}
                </ul>
              ) : (
                <ul className="max-h-[55vh] space-y-3 overflow-y-auto">
                  {items.map((m) => <li key={m.id}><FileCard m={m} mine={false} /><p className="mt-0.5 text-[11px] text-slate-500">{m.senderName} · {listTime(m.at)}</p></li>)}
                </ul>
              )}
          {loading && <p className="flex items-center justify-center gap-2 py-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading…</p>}
          {hasMore && !loading && <button type="button" onClick={() => load(items[items.length - 1]?.id)} className="mx-auto block text-sm font-semibold text-blue-600 dark:text-sky-400">Load more</button>}
        </div>
      </Modal>
      {viewing && <Lightbox item={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}
