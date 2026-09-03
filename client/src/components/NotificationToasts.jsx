import React from 'react';
import { Bell } from 'lucide-react';
import { useNotification } from '../context/NotificationContext.jsx';
import { getModuleMeta } from '../utils/notificationMeta.js';
import { formatTime } from '../utils/format.js';

/**
 * Toast stack for NEW notifications (live arrivals only).
 * - Never marks a notification read by itself.
 * - Clicking opens the notification (mark read + navigate to its module).
 * - Auto-dismisses after a few seconds (managed by the provider).
 */
export default function NotificationToasts() {
  const { toasts, openNotification, dismissToast } = useNotification();

  if (!toasts.length) return null;

  return (
    <div className="fixed top-20 right-4 left-4 sm:left-auto sm:w-96 z-[70] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const meta = getModuleMeta(toast.module || toast.type);
        const Icon = meta.icon || Bell;
        return (
          <div
            key={toast.toastId}
            role="button"
            tabIndex={0}
            onClick={() => openNotification(toast)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openNotification(toast);
              }
            }}
            className="pointer-events-auto w-full text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg shadow-slate-200/60 dark:shadow-none p-3.5 flex items-start gap-3 notification-toast-in hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors cursor-pointer"
          >
            <span className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
              <Icon className={`w-4 h-4 ${meta.color}`} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold dark:text-white truncate">{toast.title}</span>
                <span className="text-[10px] text-slate-400 font-semibold flex-shrink-0">
                  {formatTime(toast.createdAt)}
                </span>
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed line-clamp-2">
                {toast.message}
              </span>
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                dismissToast(toast.toastId);
              }}
              className="text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-300 text-lg leading-none flex-shrink-0 mt-0.5 px-1 cursor-pointer"
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
