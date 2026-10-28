import mongoose from 'mongoose';
import { ConnectNotification } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import * as realtime from './realtime.js';
import { pushToUser } from './push.service.js';

/** Connect notifications: saved for the person and pushed live when they are online. Never throws into the caller's flow. */
const oid = (v) => new mongoose.Types.ObjectId(String(v));

const dto = (n) => ({ id: String(n._id), type: n.type, title: n.title, body: n.body, link: n.link, conversationId: n.conversationId ? String(n.conversationId) : null, read: Boolean(n.readAt), at: n.createdAt });

export async function notify(userId, { type, title, body = '', link = '/connect', conversationId }) {
  try {
    const n = await ConnectNotification.create({ userId: oid(userId), type, title: String(title).slice(0, 120), body: String(body).slice(0, 200), link, ...(conversationId ? { conversationId: oid(conversationId) } : {}) });
    realtime.emitToUser(userId, 'connect', { kind: 'notification', item: dto(n.toObject()) });
    pushToUser(userId, { title: n.title, body: n.body, url: link, tag: `cn-${type}` });
  } catch (err) {
    console.error('[connect] notification failed:', err.message);
  }
}

export const notifyMany = (userIds, payload) => Promise.all(userIds.map((u) => notify(u, payload)));

export async function listNotifications(me) {
  const [items, unread] = await Promise.all([
    ConnectNotification.find({ userId: oid(me) }).sort({ createdAt: -1 }).limit(40).lean(),
    ConnectNotification.countDocuments({ userId: oid(me), readAt: { $exists: false } }),
  ]);
  return { items: items.map(dto), unread };
}

export async function markNotificationsRead(me, ids) {
  const filter = { userId: oid(me), readAt: { $exists: false } };
  if (Array.isArray(ids) && ids.length) {
    if (ids.some((i) => !mongoose.isValidObjectId(i))) throw ApiError.badRequest('Invalid notification.');
    filter._id = { $in: ids.map(oid) };
  }
  await ConnectNotification.updateMany(filter, { $set: { readAt: new Date() } });
  return { ok: true };
}

/** Opening a chat clears the "shared with you" notifications that belong to it. */
export async function clearForConversation(me, conversationId) {
  await ConnectNotification.updateMany({ userId: oid(me), conversationId: oid(conversationId), readAt: { $exists: false } }, { $set: { readAt: new Date() } }).catch(() => {});
}
