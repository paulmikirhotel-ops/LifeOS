import {
  Bell,
  CheckSquare,
  Calendar,
  Book,
  Zap,
  Wallet,
  Heart,
  Target,
  Mail,
  Clock,
  Video,
} from 'lucide-react';

/**
 * Central module metadata for notifications — icon, accent color classes,
 * and the deep-link route used when the user opens a notification.
 */
export const MODULE_META = {
  task: { icon: CheckSquare, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/30', route: '/tasks' },
  schedule: { icon: Calendar, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/30', route: '/calendar' },
  calendar: { icon: Calendar, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/30', route: '/calendar' },
  journal: { icon: Book, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/30', route: '/journal' },
  focus: { icon: Zap, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-900/30', route: '/focus' },
  finance: { icon: Wallet, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/30', route: '/finance' },
  habit: { icon: Heart, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-900/30', route: '/habits' },
  goal: { icon: Target, color: 'text-fuchsia-500', bg: 'bg-fuchsia-50 dark:bg-fuchsia-900/30', route: '/goals' },
  meeting: { icon: Video, color: 'text-cyan-500', bg: 'bg-cyan-50 dark:bg-cyan-900/30', route: '/meetings' },
  invitation: { icon: Mail, color: 'text-sky-500', bg: 'bg-sky-50 dark:bg-sky-900/30', route: '/settings' },
  reminder: { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/30', route: null },
  system: { icon: Bell, color: 'text-slate-500', bg: 'bg-slate-100 dark:bg-slate-800', route: null },
};

export function getModuleMeta(module) {
  const key = module || 'system';
  return MODULE_META[key] || MODULE_META.system;
}

export function moduleRoute(module) {
  return getModuleMeta(module).route;
}

/**
 * Where a notification should take the user. Notifications may carry their own deep link in
 * data.path (meetings do: the workspace meeting for members, the invitation page for people who
 * joined through a link). Only in-app paths are accepted.
 */
export function notificationPath(n) {
  const p = n?.data?.path;
  if (typeof p === 'string' && p.startsWith('/') && !p.startsWith('//')) return p;
  if ((n?.module || n?.type) === 'meeting' && n?.relatedId) return `/meetings/${n.relatedId}`;
  return moduleRoute(n?.module || n?.type);
}

/** Optional primary action button, e.g. "Join Meeting" on meeting-start notifications. */
export function notificationAction(n) {
  if (n?.data?.action !== 'join') return null;
  const p = n.data.joinPath;
  if (typeof p !== 'string' || !p.startsWith('/') || p.startsWith('//')) return null;
  return { label: n.data.actionLabel || 'Join Meeting', path: p };
}
