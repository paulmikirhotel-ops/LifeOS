import React from 'react';
import { WifiOff, RefreshCw, CloudUpload, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useOffline } from '../../offline/status.js';
import { flush } from '../../offline/attach.js';

const clock = (t) => (t ? new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');

/** One thin strip under the top of every page. Silent when everything is normal. */
export default function OfflineBanner() {
  const s = useOffline();
  const [synced, setSynced] = React.useState(0);

  React.useEffect(() => {
    const on = (e) => { setSynced(e.detail?.count || 1); setTimeout(() => setSynced(0), 8000); };
    window.addEventListener('lifeos:synced', on);
    return () => window.removeEventListener('lifeos:synced', on);
  }, []);

  let tone = null; let icon = null; let text = null; let action = null;
  if (!s.online) {
    tone = 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800'; icon = <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />;
    text = s.cachedAt ? `Offline. Showing your saved copy from ${clock(s.cachedAt)}.` : 'Offline. Some things may not load.';
    if (s.queued) text += ` ${s.queued} change${s.queued > 1 ? 's' : ''} waiting to upload.`;
  } else if (s.flushing) {
    tone = 'bg-indigo-50 text-indigo-900 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-100 dark:border-indigo-800'; icon = <CloudUpload className="h-4 w-4 shrink-0" aria-hidden="true" />;
    text = 'Uploading your changes…';
  } else if (synced) {
    tone = 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800'; icon = <CloudUpload className="h-4 w-4 shrink-0" aria-hidden="true" />;
    text = `Back online. Uploaded ${synced} change${synced > 1 ? 's' : ''}.`;
    action = <button type="button" onClick={() => window.location.reload()} className="underline font-medium inline-flex items-center gap-1"><RefreshCw className="h-3 w-3" aria-hidden="true" />Reload to see them</button>;
  } else if (s.queued) {
    tone = 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800'; icon = <CloudUpload className="h-4 w-4 shrink-0" aria-hidden="true" />;
    text = `${s.queued} change${s.queued > 1 ? 's' : ''} waiting to upload.`;
    action = <button type="button" onClick={() => flush()} className="underline font-medium">Try now</button>;
  } else if (s.failed) {
    tone = 'bg-red-50 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-100 dark:border-red-800'; icon = <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />;
    text = `${s.failed} change${s.failed > 1 ? 's' : ''} could not be saved.`;
    action = <Link to="/data" className="underline font-medium">Review</Link>;
  }
  if (!text) return null;
  return (
    <div role="status" className={`border-b px-4 py-2 text-sm flex flex-wrap items-center gap-x-3 gap-y-1 ${tone}`}>
      {icon}<span className="min-w-0">{text}</span>{action}
    </div>
  );
}
