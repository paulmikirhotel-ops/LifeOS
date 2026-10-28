import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderOpen, Loader2 } from 'lucide-react';
import { Card, EmptyState } from '../../components/ui.jsx';
import { Lightbox, MediaThumb, FileCard } from '../../components/connect/Attachments.jsx';
import { connectApi } from '../../api/connect.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';
import { listTime } from '../../utils/connectFormat.js';

const TABS = [['media', 'Photos & videos'], ['docs', 'Documents']];

/** Everything shared in your conversations: photos and videos in a grid, documents in a list. */
export default function FilesPage() {
  const { addToast } = useToast();
  const [type, setType] = useState('media');
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async (before) => {
    setLoading(true);
    try {
      const r = await connectApi.sharedFiles({ type, ...(before ? { before } : {}) });
      setItems((prev) => (before ? [...prev, ...r.data.items] : r.data.items));
      setHasMore(r.data.hasMore);
    } catch (err) { addToast(formatApiError(err), 'error'); } finally { setLoading(false); }
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setItems([]); load(); }, [load]);

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="File types" className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={type === k} onClick={() => setType(k)}
            className={`min-h-[40px] whitespace-nowrap rounded-lg px-4 text-sm font-semibold transition-colors ${type === k ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-sky-400' : 'text-slate-500'}`}>{label}</button>
        ))}
      </div>
      <Card className="p-3">
        {items.length === 0 && !loading
          ? <EmptyState icon={FolderOpen} title={type === 'media' ? 'No photos or videos yet' : 'No documents yet'} description="Files shared in your chats and groups are collected here." />
          : type === 'media'
            ? (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {items.map((m) => (
                  <li key={m.id}>
                    <MediaThumb m={m} tile onOpen={setViewing} />
                    <Link to={`/connect/chats/${m.conversationId}`} className="mt-1 block truncate text-xs text-slate-500 hover:text-blue-600">{m.conversationName} · {listTime(m.at)}</Link>
                  </li>
                ))}
              </ul>
            )
            : (
              <ul className="space-y-3">
                {items.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <FileCard m={m} mine={false} />
                    <Link to={`/connect/chats/${m.conversationId}`} className="min-w-0 text-xs text-slate-500 hover:text-blue-600">{m.senderName} · {m.conversationName} · {listTime(m.at)}</Link>
                  </li>
                ))}
              </ul>
            )}
        {loading && <p className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading…</p>}
        {hasMore && !loading && <p className="pt-4 text-center"><button type="button" onClick={() => load(items[items.length - 1]?.id)} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-blue-600 dark:bg-slate-800 dark:text-sky-400">Load more</button></p>}
      </Card>
      {viewing && <Lightbox item={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
