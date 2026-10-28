import React, { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCheck, ChevronLeft, ChevronRight, Trash2, Video } from 'lucide-react';
import api from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import { getModuleMeta, notificationAction } from '../utils/notificationMeta.js';
import { formatDate } from '../utils/format.js';
import { Button, Card, EmptyState, ErrorState, SkeletonList, PageHeader, IconButton } from '../components/ui.jsx';

const PAGE_SIZE = 12;

export default function NotificationsPage() {
  const { addToast } = useToast();
  const { markAllRead: contextMarkAllRead, runNotificationAction } = useNotification();

  const [tab, setTab] = useState('all'); // 'all' | 'unread'
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (pageNo, onlyUnread) => {
    setLoading(true);
    setFailed(false);
    try {
      const params = { page: pageNo, limit: PAGE_SIZE };
      if (onlyUnread) params.isRead = 'false';
      const res = await api.get('/notifications', { params });
      if (res.success) {
        setItems(res.data.items || []);
        setTotal(res.data.total || 0);
      }
    } catch (e) {
      console.error('Notifications failed to load', e);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    load(1, tab === 'unread');
  }, [tab, load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const markRead = async (id) => {
    await api.patch(`/notifications/${id}/read`).catch(() => {});
    setItems((prev) => prev.map((i) => (i._id === id ? { ...i, isRead: true } : i)));
    if (tab === 'unread') load(page, true);
  };

  const markAllRead = async () => {
    await contextMarkAllRead();
    addToast('All notifications marked as read');
    load(page, tab === 'unread');
  };

  const removeOne = async (id) => {
    await api.delete(`/notifications/${id}`).catch(() => {});
    addToast('Notification removed', 'success');
    load(page, tab === 'unread');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <PageHeader
        title="Notifications"
        description={tab === 'unread' ? 'Unread notifications' : 'Stay updated on your digital life'}
        actions={
          <>
            <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-sm" role="tablist" aria-label="Filter notifications">
              {[
                { id: 'all', label: 'All' },
                { id: 'unread', label: 'Unread' },
              ].map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`min-h-9 px-4 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 ${tab === t.id ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <Button variant="secondary" size="sm" icon={CheckCheck} onClick={markAllRead} className="flex-shrink-0">
              Mark all read
            </Button>
          </>
        }
      />

      <div className="space-y-3">
        {loading && items.length === 0 ? (
          <SkeletonList rows={5} />
        ) : failed && items.length === 0 ? (
          <Card><ErrorState title="Notifications couldn't load" onRetry={() => load(page, tab === 'unread')} /></Card>
        ) : items.length > 0 ? (
          <>
            {items.map((n) => {
              const meta = getModuleMeta(n.module || n.type);
              const Icon = meta.icon || Bell;
              return (
                <Card key={n._id} className={`p-4 transition-colors hover:border-indigo-200 dark:hover:border-indigo-900 ${!n.isRead ? 'border-l-4 border-l-indigo-500' : ''}`}>
                  <div className="flex gap-3 sm:gap-4">
                    <span className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                      <Icon className={`w-4.5 h-4.5 ${meta.color}`} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <h2 className={`text-sm mb-1 truncate ${n.isRead ? 'font-semibold text-slate-600 dark:text-slate-400' : 'font-bold text-slate-900 dark:text-white'}`}>
                          {n.title}
                        </h2>
                        {!n.isRead && <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1" role="img" aria-label="Unread" />}
                      </div>
                      {n.message && (
                        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 line-clamp-2">{n.message}</p>
                      )}
                      {notificationAction(n) && (
                        <button type="button" onClick={() => runNotificationAction(n)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 min-h-[44px] text-sm font-bold text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
                          <Video className="w-4 h-4" aria-hidden="true" /> {notificationAction(n).label}
                        </button>
                      )}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                          {formatDate(n.createdAt, 'MMMM d, yyyy · h:mm a')}
                        </span>
                        {!n.isRead && (
                          <button
                            onClick={() => markRead(n._id)}
                            className="inline-flex items-center min-h-9 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 rounded"
                          >
                            Mark as read
                          </button>
                        )}
                      </div>
                    </div>
                    <IconButton icon={Trash2} tone="danger" label="Delete notification" className="self-start flex-shrink-0 -mr-1 -mt-1" onClick={() => removeOne(n._id)} />
                  </div>
                </Card>
              );
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={ChevronLeft}
                  disabled={page <= 1}
                  onClick={() => {
                    const next = Math.max(1, page - 1);
                    setPage(next);
                    load(next, tab === 'unread');
                  }}
                >
                  Previous
                </Button>
                <span className="text-xs font-semibold text-slate-500">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => {
                    const next = Math.min(totalPages, page + 1);
                    setPage(next);
                    load(next, tab === 'unread');
                  }}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={Bell}
            title={tab === 'unread' ? 'No unread notifications' : 'All clear'}
            description={
              tab === 'unread'
                ? "You've read everything — nice work."
                : "You don't have any notifications right now."
            }
          />
        )}
      </div>
    </div>
  );
}
