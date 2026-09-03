import React from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, X, BellOff } from 'lucide-react';
import { useNotification } from '../context/NotificationContext.jsx';
import { getModuleMeta } from '../utils/notificationMeta.js';
import { formatDate } from '../utils/format.js';

function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return formatDate(iso, 'MMM d');
}

/**
 * Notification panel: dropdown under the bell on desktop, bottom sheet on
 * mobile. Unread items are visually distinct; clicking marks read + navigates.
 */
export default function NotificationsPanel() {
  const { panelOpen, setPanelOpen, items, unread, markRead, markAllRead, openNotification } = useNotification();

  if (!panelOpen) return null;

  return (
    <div className="fixed inset-0 z-50 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2">
      {/* Backdrop (full-screen click-away on every breakpoint) */}
      <div className="fixed inset-0 bg-slate-900/40 sm:bg-transparent" onClick={() => setPanelOpen(false)} />

      <div className="absolute inset-x-0 bottom-0 sm:inset-x-auto sm:left-auto sm:right-0 sm:bottom-auto sm:top-0 sm:w-[26rem] bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[80dvh] sm:max-h-[70vh] pb-[env(safe-area-inset-bottom,0px)] sm:pb-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-bold dark:text-white">Notifications</h3>
            {unread > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
            <button
              onClick={() => setPanelOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close notifications"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800/60">
          {items.length === 0 ? (
            <div className="py-12 flex flex-col items-center text-center px-6">
              <BellOff className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">All caught up</p>
              <p className="text-xs text-slate-400 mt-1">New notifications will appear here in real time.</p>
            </div>
          ) : (
            items.slice(0, 12).map((n) => {
              const meta = getModuleMeta(n.module || n.type);
              const Icon = meta.icon || Bell;
              return (
                <div
                  key={n._id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openNotification(n)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openNotification(n);
                    }
                  }}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer ${n.isRead ? 'opacity-70' : ''}`}
                >
                  <span className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                    <Icon className={`w-4 h-4 ${meta.color}`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={`text-sm truncate ${n.isRead ? 'font-medium text-slate-600 dark:text-slate-400' : 'font-bold text-slate-900 dark:text-white'}`}>
                        {n.title}
                      </span>
                      {!n.isRead && <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />}
                    </span>
                    {n.message && (
                      <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed line-clamp-2">
                        {n.message}
                      </span>
                    )}
                    <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-medium">
                      {timeAgo(n.createdAt)}
                    </span>
                  </span>
                  {!n.isRead && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markRead(n._id);
                      }}
                      className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 uppercase tracking-wide flex-shrink-0 mt-1 px-1 cursor-pointer"
                    >
                      Read
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 dark:border-slate-800 p-2">
          <Link
            to="/notifications"
            onClick={() => setPanelOpen(false)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
          >
            View all notifications
          </Link>
        </div>
      </div>
    </div>
  );
}
