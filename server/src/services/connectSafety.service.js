import mongoose from 'mongoose';
import { User, Friendship, ConnectBlock, ConnectReport, ConnectConversation, ConnectMessage } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import * as realtime from './realtime.js';
import { pairKey, cleanText } from '../utils/connectLogic.js';

/** Blocking, reporting and privacy controls for Connect. All per person. */
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const DAILY_REPORTS = 10;

/** Has either of these two people blocked the other? */
export async function isBlockedEither(a, b) {
  return Boolean(await ConnectBlock.exists({ $or: [{ blockerId: oid(a), blockedId: oid(b) }, { blockerId: oid(b), blockedId: oid(a) }] }));
}

/** Ids of everybody I blocked or who blocked me (used to hide people from search). */
export async function blockedWith(me) {
  const rows = await ConnectBlock.find({ $or: [{ blockerId: oid(me) }, { blockedId: oid(me) }] }).select('blockerId blockedId').lean();
  return rows.map((r) => (String(r.blockerId) === String(me) ? String(r.blockedId) : String(r.blockerId)));
}

export async function blockUser(me, userId) {
  if (!mongoose.isValidObjectId(userId) || String(me) === String(userId)) throw ApiError.badRequest('You cannot block yourself.');
  const target = await User.findById(userId).select('_id').lean();
  if (!target) throw ApiError.notFound('That person was not found.');
  await ConnectBlock.updateOne({ blockerId: oid(me), blockedId: oid(userId) }, { $setOnInsert: { blockerId: oid(me), blockedId: oid(userId) } }, { upsert: true });
  // They stop being a friend (and any request between us disappears). Old chats stay readable but nobody can write or call.
  await Friendship.deleteOne({ pairKey: pairKey(me, userId) });
  [me, userId].forEach((u) => realtime.emitToUser(u, 'connect', { kind: 'friends-changed' }));
  return { blocked: true };
}

export async function unblockUser(me, userId) {
  if (!mongoose.isValidObjectId(userId)) throw ApiError.badRequest('Invalid person.');
  await ConnectBlock.deleteOne({ blockerId: oid(me), blockedId: oid(userId) });
  return { blocked: false };
}

export async function listBlocked(me) {
  const rows = await ConnectBlock.find({ blockerId: oid(me) }).sort({ createdAt: -1 }).lean();
  const users = await User.find({ _id: { $in: rows.map((r) => r.blockedId) } }).select('name').lean();
  const names = new Map(users.map((u) => [String(u._id), u.name]));
  return { items: rows.map((r) => ({ id: String(r.blockedId), name: names.get(String(r.blockedId)) || 'Someone', at: r.createdAt })) };
}

export async function reportUser(me, { userId, messageId, reason, details }) {
  if (!mongoose.isValidObjectId(userId) || String(me) === String(userId)) throw ApiError.badRequest('Choose someone else to report.');
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  if ((await ConnectReport.countDocuments({ reporterId: oid(me), createdAt: { $gte: since } })) >= DAILY_REPORTS) {
    throw new ApiError(429, 'You have sent many reports today. Please try again tomorrow.', { code: 'RATE_LIMITED' });
  }
  const doc = { reporterId: oid(me), targetUserId: oid(userId), reason, details: cleanText(details || '', 500) };
  if (messageId) {
    if (!mongoose.isValidObjectId(messageId)) throw ApiError.badRequest('Invalid message.');
    const m = await ConnectMessage.findById(messageId).lean();
    // Only a message I can actually see, written by the person I report.
    const member = m && (await ConnectConversation.exists({ _id: m.conversationId, members: oid(me) }));
    if (!m || !member || String(m.senderId) !== String(userId)) throw ApiError.notFound('Message not found.');
    Object.assign(doc, { conversationId: m.conversationId, messageId: m._id, messageKind: m.kind, messageText: String(m.text || m.attachment?.name || m.resource?.title || '').slice(0, 1000) });
  } else if (!(await Friendship.exists({ pairKey: pairKey(me, userId) })) && !(await ConnectConversation.exists({ members: { $all: [oid(me), oid(userId)] } }))) {
    throw ApiError.notFound('That person was not found.'); // you can only report people you share a chat or friendship with
  }
  await ConnectReport.create(doc);
  return { reported: true };
}

export async function getPrivacy(me) {
  const u = await User.findById(me).select('discoverable').lean();
  return { discoverable: u?.discoverable !== false };
}

export async function setPrivacy(me, { discoverable }) {
  await User.updateOne({ _id: oid(me) }, { $set: { discoverable: Boolean(discoverable) } });
  return { discoverable: Boolean(discoverable) };
}

// ── administrator review ──
export async function listReports({ status = 'open' } = {}) {
  const rows = await ConnectReport.find(['open', 'reviewed', 'dismissed'].includes(status) ? { status } : {}).sort({ createdAt: -1 }).limit(100).lean();
  const ids = [...new Set(rows.flatMap((r) => [String(r.reporterId), String(r.targetUserId)]))];
  const users = await User.find({ _id: { $in: ids.map(oid) } }).select('name email').lean();
  const by = new Map(users.map((u) => [String(u._id), u]));
  return {
    items: rows.map((r) => ({
      id: String(r._id), status: r.status, reason: r.reason, details: r.details, at: r.createdAt,
      reporter: { id: String(r.reporterId), name: by.get(String(r.reporterId))?.name || 'Unknown' },
      target: { id: String(r.targetUserId), name: by.get(String(r.targetUserId))?.name || 'Unknown', email: by.get(String(r.targetUserId))?.email || '' },
      message: r.messageId ? { kind: r.messageKind, text: r.messageText } : null,
    })),
  };
}

export async function setReportStatus(id, status) {
  if (!mongoose.isValidObjectId(id) || !['open', 'reviewed', 'dismissed'].includes(status)) throw ApiError.badRequest('Invalid request.');
  const r = await ConnectReport.findByIdAndUpdate(id, { $set: { status } }, { new: true });
  if (!r) throw ApiError.notFound('Report not found.');
  return { id: String(r._id), status: r.status };
}
