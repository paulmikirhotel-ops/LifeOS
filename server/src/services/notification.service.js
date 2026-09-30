import { ApiError } from '../utils/ApiError.js';
import { Notification, User } from '../models/index.js';
import { assertObjectId } from '../utils/objectId.js';
import * as realtime from './realtime.js';

/**
 * Centralized notification service.
 *
 * Rules:
 * - Every notification is scoped to tenantId + userId. Querying or mutating
 *   without BOTH is impossible through this service.
 * - createNotification NEVER throws: a failed notification must not break the
 *   task/calendar/etc. operation that triggered it. Errors are logged.
 * - DedupeKey (unique sparse index) makes reminders idempotent across server
 *   restarts and scheduler ticks.
 */

export const MODULES = [
  'task',
  'schedule',
  'calendar',
  'journal',
  'focus',
  'finance',
  'habit',
  'goal',
  'meeting',
  'system',
  'invitation',
];

const PREF_KEY_BY_MODULE = Object.fromEntries(
  MODULES.map((m) => [m, m === 'system' ? 'system' : m === 'invitation' ? 'invitation' : m])
);

function toClient(n) {
  return {
    _id: n._id,
    title: n.title,
    message: n.body || '',
    type: n.type,
    module: n.module || n.type || 'system',
    relatedId: n.relatedId || null,
    priority: n.priority || 'normal',
    isRead: !!n.isRead,
    readAt: n.readAt || null,
    createdAt: n.createdAt,
    expiresAt: n.expiresAt || null,
    data: n.data || {},
  };
}

/** Prefs are personal (not tenant data) — stored on the User document. */
export const DEFAULT_PREFS = {
  sound: true,
  toast: true,
  modules: {
    task: true,
    schedule: true,
    calendar: true,
    journal: true,
    focus: true,
    finance: true,
    habit: true,
    goal: true,
    meeting: true,
    system: true,
    invitation: true,
  },
};

function normalizePrefs(raw = {}) {
  const modules = { ...DEFAULT_PREFS.modules };
  for (const key of Object.keys(modules)) {
    if (typeof raw.modules?.[key] === 'boolean') modules[key] = raw.modules[key];
  }
  return {
    sound: typeof raw.sound === 'boolean' ? raw.sound : DEFAULT_PREFS.sound,
    toast: typeof raw.toast === 'boolean' ? raw.toast : DEFAULT_PREFS.toast,
    modules,
  };
}

async function prefsForUser(userId) {
  try {
    const user = await User.findById(userId).select('notificationPrefs').lean();
    return normalizePrefs(user?.notificationPrefs);
  } catch {
    return { ...DEFAULT_PREFS, modules: { ...DEFAULT_PREFS.modules } };
  }
}

/**
 * Create a notification and push it in real time to the recipient.
 * Returns the created (client-shaped) notification, or null when skipped
 * (duplicate dedupeKey, module disabled in preferences, or missing ids).
 * NEVER throws.
 */
export async function createNotification({
  tenantId,
  userId,
  type = 'system',
  module = null,
  title,
  message = '',
  relatedId = null,
  priority = 'normal',
  expiresAt = null,
  dedupeKey = null,
  data = {},
  checkPrefs = true,
}) {
  try {
    if (!tenantId || !userId || !title) {
      console.warn('[notify] skipped: missing tenantId/userId/title', { tenantId, userId, title });
      return null;
    }

    const mod = module || (MODULES.includes(type) ? type : 'system');

    // Respect per-module preferences for content notifications.
    // System/invitation alerts are always delivered.
    if (checkPrefs && !['system', 'invitation'].includes(mod)) {
      const prefs = await prefsForUser(userId);
      const prefKey = PREF_KEY_BY_MODULE[mod] || mod;
      if (prefs.modules[prefKey] === false) return null;
    }

    const doc = {
      tenantId,
      userId,
      type,
      module: mod,
      title: String(title).slice(0, 200),
      body: message ? String(message).slice(0, 1000) : undefined,
      relatedId: relatedId || undefined,
      priority: ['low', 'normal', 'high'].includes(priority) ? priority : 'normal',
      expiresAt: expiresAt || undefined,
      data: data || {},
    };
    if (dedupeKey) doc.dedupeKey = String(dedupeKey).slice(0, 200);

    let notification;
    try {
      notification = await Notification.create(doc);
    } catch (err) {
      // Unique dedupeKey violation → this reminder already exists. Silent no-op.
      if (err?.code === 11000) return null;
      throw err;
    }

    const clientShape = toClient(notification.toObject ? notification.toObject() : notification);
    realtime.emit(String(userId), String(tenantId), { event: 'notification:created', notification: clientShape });
    return clientShape;
  } catch (err) {
    console.error('[notify] createNotification failed:', err.message);
    return null; // Notification problems must never break the caller.
  }
}

/** Fire-and-forget helper for module hooks. */
export function notify(opts) {
  createNotification(opts).catch(() => {});
}

/** Legacy alias used by older callers. */
export async function createForMember(tenantId, userId, { type, title, body, data }) {
  if (!userId) return null;
  return createNotification({ tenantId, userId, type, title, message: body, data });
}

// ── Reads (always tenant + user scoped) ──────────────────────────────────────

export async function list(user, { page = 1, limit = 20, isRead, module } = {}) {
  const query = { tenantId: user.tenantId, userId: user.id };
  if (typeof isRead === 'boolean') query.isRead = isRead;
  if (module && MODULES.includes(module)) query.module = module;

  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

  const [items, total] = await Promise.all([
    Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    Notification.countDocuments(query),
  ]);

  return { items: items.map(toClient), total, page: p, limit: l };
}

export async function unreadCount(user) {
  return Notification.countDocuments({ tenantId: user.tenantId, userId: user.id, isRead: false });
}

export async function markRead(user, id) {
  assertObjectId(id);
  const notification = await Notification.findOneAndUpdate(
    { _id: id, tenantId: user.tenantId, userId: user.id },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  ).lean();
  if (!notification) throw ApiError.notFound('Notification not found');
  return toClient(notification);
}

export async function markAllRead(user) {
  const result = await Notification.updateMany(
    { tenantId: user.tenantId, userId: user.id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return { modifiedCount: result.modifiedCount };
}

export async function remove(user, id) {
  assertObjectId(id);
  const result = await Notification.deleteOne({ _id: id, tenantId: user.tenantId, userId: user.id });
  if (result.deletedCount === 0) throw ApiError.notFound('Notification not found');
  return { success: true };
}

// ── Preferences ─────────────────────────────────────────────────────────────

export async function getPreferences(userId) {
  const user = await User.findById(userId).select('notificationPrefs').lean();
  return normalizePrefs(user?.notificationPrefs);
}

export async function updatePreferences(userId, patch = {}) {
  const current = await getPreferences(userId);
  const next = {
    sound: typeof patch.sound === 'boolean' ? patch.sound : current.sound,
    toast: typeof patch.toast === 'boolean' ? patch.toast : current.toast,
    modules: { ...current.modules },
  };
  if (patch.modules && typeof patch.modules === 'object') {
    for (const key of Object.keys(next.modules)) {
      if (typeof patch.modules[key] === 'boolean') next.modules[key] = patch.modules[key];
    }
  }

  await User.updateOne({ _id: userId }, { $set: { notificationPrefs: next } });
  return next;
}

/** Deletes old read notifications (history hygiene). Runs from the scheduler. */
export async function cleanupExpired() {
  const cutoff = new Date(Date.now() - 90 * 86400000); // 90 days
  const res = await Notification.deleteMany({
    isRead: true,
    $or: [{ readAt: { $lt: cutoff } }, { createdAt: { $lt: cutoff } }],
  });
  return { deletedCount: res.deletedCount };
}
