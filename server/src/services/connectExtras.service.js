import mongoose from 'mongoose';
import { ConnectConversation, ConnectMessage } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import * as storage from './storage.service.js';
import * as realtime from './realtime.js';
import crypto from 'node:crypto';
import { applyReaction, REACTIONS, cleanText, escapeRegex } from '../utils/connectLogic.js';
import { loadConversation, assertCanWrite, toDto, createMessage, memberIds, allowSend, loadGroup, changed } from './connect.service.js';
import { inspectFile } from '../utils/fileSniff.js';

/** Reactions, forwarding, mute / archive and search inside a chat. */
const oid = (v) => new mongoose.Types.ObjectId(String(v));

/** A message I can see (I am a member of its conversation). */
async function visibleMessage(me, messageId) {
  if (!mongoose.isValidObjectId(messageId)) throw ApiError.notFound('Message not found.');
  const m = await ConnectMessage.findById(messageId);
  if (!m || m.deletedAt || m.kind === 'system') throw ApiError.notFound('Message not found.');
  const c = await ConnectConversation.findOne({ _id: m.conversationId, members: oid(me) });
  if (!c) throw ApiError.notFound('Message not found.');
  return { m, c };
}

export async function react(me, messageId, emoji) {
  if (emoji !== null && emoji !== undefined && !REACTIONS.includes(emoji)) throw ApiError.badRequest('That reaction is not available.');
  const { m, c } = await visibleMessage(me, messageId);
  await assertCanWrite(c, me);
  const next = applyReaction(m.reactions || [], me, emoji);
  await ConnectMessage.updateOne({ _id: m._id }, { $set: { reactions: next } });
  const reactions = next.map((r) => ({ u: String(r.userId), e: r.emoji }));
  memberIds(c).filter((u) => u !== String(me)).forEach((u) => realtime.emitToUser(u, 'connect', { kind: 'reaction', conversationId: String(c._id), messageId: String(m._id), reactions }));
  return { messageId: String(m._id), reactions };
}

const FORWARDABLE = ['text', 'image', 'video', 'audio', 'file', 'contact', 'resource'];

async function copyFile(att, targetConvId) {
  const src = await storage.getObject(att.key);
  const chunks = [];
  for await (const ch of src.stream) chunks.push(Buffer.from(ch));
  const buffer = Buffer.concat(chunks);
  const ext = (att.key.split('.').pop() || 'bin').slice(0, 8);
  const key = `connect/${targetConvId}/${new mongoose.Types.ObjectId()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  await storage.putObject(key, buffer, att.mime || 'application/octet-stream');
  return key;
}

/** Sends a copy of a message to up to five of my other chats. Files are copied, so deleting the original never breaks the copy. */
export async function forwardMessage(me, messageId, conversationIds = []) {
  const { m } = await visibleMessage(me, messageId);
  const kind = m.kind || 'text';
  if (!FORWARDABLE.includes(kind)) throw ApiError.badRequest('This message cannot be forwarded.');
  if (kind === 'resource' && m.resource?.type === 'note') throw ApiError.badRequest('A private note cannot be forwarded. Ask the owner to share it.');
  const ids = [...new Set(conversationIds.map(String))].slice(0, 5);
  if (!ids.length) throw ApiError.badRequest('Choose where to send it.');
  if (!allowSend(String(me))) throw new ApiError(429, 'You are sending messages too fast.', { code: 'RATE_LIMITED' });
  const targets = [];
  for (const id of ids) {
    const c = await loadConversation(me, id);
    await assertCanWrite(c, me);
    targets.push(c);
  }
  const items = [];
  for (const c of targets) {
    const fields = { kind, text: m.text || '', forwarded: true };
    if (m.attachment?.key) fields.attachment = { key: await copyFile(m.attachment, c._id), name: m.attachment.name, mime: m.attachment.mime, size: m.attachment.size };
    if (m.contact?.userId) fields.contact = { userId: m.contact.userId, name: m.contact.name };
    if (m.resource?.type) {
      const { added, ...rest } = m.toObject().resource;
      fields.resource = rest;
    }
    items.push(await createMessage(c, me, fields));
  }
  return { items };
}

/** Mute and archive are personal: they change nothing for the other people in the chat. */
export async function setPrefs(me, conversationId, { muted, archived }) {
  const c = await loadConversation(me, conversationId);
  const set = {};
  if (typeof muted === 'boolean') set['prefs.$.muted'] = muted;
  if (typeof archived === 'boolean') set['prefs.$.archived'] = archived;
  if (!Object.keys(set).length) throw ApiError.badRequest('Nothing to change.');
  const r = await ConnectConversation.updateOne({ _id: c._id, 'prefs.userId': oid(me) }, { $set: set });
  if (!r.matchedCount) {
    await ConnectConversation.updateOne({ _id: c._id, 'prefs.userId': { $ne: oid(me) } }, { $push: { prefs: { userId: oid(me), muted: muted === true, archived: archived === true } } });
  }
  const fresh = await ConnectConversation.findById(c._id).select('prefs').lean();
  const p = (fresh.prefs || []).find((x) => String(x.userId) === String(me));
  return { muted: Boolean(p?.muted), archived: Boolean(p?.archived) };
}

/** Text search inside one conversation (newest first). Only the members can search it. */
export async function searchMessages(me, conversationId, q, limit = 30) {
  const c = await loadConversation(me, conversationId);
  const term = cleanText(q || '', 80);
  if (term.length < 2) return { items: [] };
  const rows = await ConnectMessage.find({ conversationId: c._id, deletedAt: { $exists: false }, kind: { $ne: 'system' }, text: { $regex: escapeRegex(term), $options: 'i' } }).sort({ _id: -1 }).limit(limit).lean();
  return { items: rows.map((m) => toDto(m, null)) };
}

// ── group picture ──
const AVATAR_MAX = 2 * 1024 * 1024;

/** Admins set the group picture (JPG, PNG or WebP up to 2 MB). The old file is deleted. */
export async function setGroupAvatar(me, groupId, file) {
  const c = await loadGroup(me, groupId, { admin: true });
  if (!file?.buffer) throw ApiError.badRequest('Choose a picture.');
  if (file.buffer.length > AVATAR_MAX) throw new ApiError(413, 'The picture can be up to 2 MB.', { code: 'PAYLOAD_TOO_LARGE' });
  const info = inspectFile(file.originalname, file.buffer);
  if (info.error || !['jpg', 'jpeg', 'png', 'webp'].includes(info.ext)) throw ApiError.badRequest('Use a JPG, PNG or WebP picture.');
  const key = `connect/${c._id}/avatar-${crypto.randomBytes(6).toString('hex')}.${info.ext}`;
  await storage.putObject(key, file.buffer, info.mime);
  const old = c.avatarKey;
  c.avatarKey = key;
  await c.save();
  if (old) storage.deleteObject(old).catch(() => {});
  changed(c);
  return { avatar: `gav:${c._id}:${key.split('/').pop().split('.')[0]}` };
}

export async function removeGroupAvatar(me, groupId) {
  const c = await loadGroup(me, groupId, { admin: true });
  const old = c.avatarKey;
  c.avatarKey = undefined;
  await c.save();
  if (old) storage.deleteObject(old).catch(() => {});
  changed(c);
  return { avatar: null };
}

/** The picture itself, for members only. */
export async function openGroupAvatar(me, groupId) {
  const c = await loadConversation(me, groupId);
  if (c.type !== 'group' || !c.avatarKey) throw ApiError.notFound('No picture.');
  const obj = await storage.getObject(c.avatarKey);
  const ext = c.avatarKey.split('.').pop();
  return { ...obj, mime: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg' };
}
