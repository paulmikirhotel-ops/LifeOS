import * as notificationService from '../services/notification.service.js';
import * as realtime from '../services/realtime.js';

export async function list(req, res) {
  const { page, limit, isRead, module } = req.query;
  const data = await notificationService.list(req.user, {
    page,
    limit,
    isRead: isRead === undefined ? undefined : isRead === 'true',
    module,
  });
  res.json({ success: true, data });
}

export async function listUnread(req, res) {
  const data = await notificationService.list(req.user, { isRead: false, limit: 20 });
  res.json({ success: true, data });
}

export async function unreadCount(req, res) {
  const count = await notificationService.unreadCount(req.user);
  res.json({ success: true, data: { count } });
}

/**
 * Server-Sent Events stream.
 * Headers must be set before any write; keep-alive heartbeats are handled by
 * the realtime hub. The connection closes when the client disconnects.
 */
export function stream(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write('retry: 15000\n\n');

  const unsubscribe = realtime.register(req.user.id, req.user.tenantId, res);

  req.on('close', () => {
    unsubscribe();
    try {
      res.end();
    } catch {
      /* already closed */
    }
  });
}

export async function markRead(req, res) {
  const data = await notificationService.markRead(req.user, req.params.id);
  res.json({ success: true, data });
}

export async function markAllRead(req, res) {
  const data = await notificationService.markAllRead(req.user);
  res.json({ success: true, data: { message: 'All notifications marked as read', ...data } });
}

export async function removeNotification(req, res) {
  await notificationService.remove(req.user, req.params.id);
  res.json({ success: true, data: { message: 'Notification removed' } });
}

export async function getPreferences(req, res) {
  const data = await notificationService.getPreferences(req.user.id);
  res.json({ success: true, data });
}

export async function patchPreferences(req, res) {
  const data = await notificationService.updatePreferences(req.user.id, req.body);
  res.json({ success: true, data });
}
