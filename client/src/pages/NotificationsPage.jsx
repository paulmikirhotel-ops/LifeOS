import React, { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCheck, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import api from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import { getModuleMeta } from '../utils/notificationMeta.js';
import { formatDate } from '../utils/format.js';
import { Button, Card, Spinner, EmptyState } from '../components/ui.jsx';

const PAGE_SIZE = 12;

export default function NotificationsPage() {
  const { addToast } = useToast();
  const { markAllRead: contextMarkAllRead } = useNotification();

  const [tab, setTab] = useState('all'); // 'all' | 'unread'
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (pageNo, onlyUnread) => {
    setLoading(true);
    try {
      const params = { page: pageNo, limit: PAGE_SIZE };
      if (onlyUnread) params.isRead = 'false';
      const res = await api.get('/notifications', { params });
      if (res.success) {
        setItems(res.data.items || []);
        setTotal(res.data.total || 0);
      }
    } catch {
      /* ignore */
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
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500 pb-10">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold dark:text-white truncate">Notifications</h1>
          <p className="text-sm text-slate-500 font-medium truncate">
            {tab === 'unread' ? 'Unread notifications' : 'Stay updated on your digital life'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-sm">
            {[
              { id: 'all', label: 'All' },
              { id: 'unread', label: 'Unread' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-1.5 rounded-lg font-semibold transition-colors ${tab === t.id ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" icon={CheckCheck} onClick={markAllRead} className="flex-shrink-0">
            Mark all read
          </Button>
        </div>
      </header>

      <div className="space-y-3">
        {loading ? (
          <div className="py-20 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : items.length > 0 ? (
          <>
            {items.map((n) => {
              const meta = getModuleMeta(n.module || n.type);
              const Icon = meta.icon || Bell;
              return (
                <Card key={n._id} className={`p-4 transition-all hover:border-indigo-200 dark:hover:border-indigo-900 group ${!n.isRead ? 'border-l-4 border-l-indigo-500' : ''}`}>
                  <div className="flex gap-3 sm:gap-4">
                    <span className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                      <Icon className={`w-4.5 h-4.5 ${meta.color}`} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <h4 className={`text-sm mb-1 truncate ${n.isRead ? 'font-semibold text-slate-600 dark:text-slate-400' : 'font-bold text-slate-900 dark:text-white'}`}>
                          {n.title}
                        </h4>
                        {!n.isRead && <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1" />}
                      </div>
                      {n.message && (
                        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 line-clamp-2">{n.message}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                          {formatDate(n.createdAt, 'MMMM d, yyyy · h:mm a')}
                        </span>
                        {!n.isRead && (
                          <button
                            onClick={() => markRead(n._id)}
                            className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline"
                          >
                            Mark as read
                          </button>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removeOne(n._id)}
                      className="self-start p-2 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
                      aria-label="Delete notification"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
