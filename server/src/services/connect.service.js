import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { User, Friendship, ConnectConversation, ConnectMessage } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import * as realtime from './realtime.js';
import { isBlockedEither, blockedWith } from './connectSafety.service.js';
import { notify, notifyMany, clearForConversation } from './connectNotify.service.js';
import * as storage from './storage.service.js';
import { pairKey, cleanText, searchTerm, escapeRegex, relationOf, createFlood, idGte, statusAmong, minId, previewOf, cleanGroupName } from '../utils/connectLogic.js';
import { inspectFile, safeName } from '../utils/fileSniff.js';
import { pushToUser } from './push.service.js';

/**
 * LifeOS Connect: friends and private chats.
 * Everything here is per person (not per workspace). Every function takes the signed-in user's id and checks that
 * the person really belongs to the friendship / conversation before reading or changing anything.
 */

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const sid = (v) => (v ? String(v) : null);
const allowSend = createFlood(20, 10000);
const allowUpload = createFlood(10, 60000);
export const MAX_UPLOAD_BYTES = (Number(process.env.CONNECT_UPLOAD_MAX_MB) || 25) * 1024 * 1024;
const GROUP_MAX = 100;
const push = (userId, payload) => realtime.emitToUser(userId, 'connect', payload);
const publicUser = (u) => ({ id: String(u._id), name: u.name, avatar: null });

// ── presence ────────────────────────────────────────────────────────────
async function friendIds(userId) {
  const rows = await Friendship.find({ status: 'accepted', $or: [{ requesterId: userId }, { addresseeId: userId }] }).select('requesterId addresseeId').lean();
  return rows.map((r) => (String(r.requesterId) === String(userId) ? String(r.addresseeId) : String(r.requesterId)));
}

const offlineTimers = new Map();
realtime.setPresenceHook((userId, online) => {
  const key = String(userId);
  clearTimeout(offlineTimers.get(key));
  const announce = async () => {
    const ids = await friendIds(key);
    ids.forEach((f) => push(f, { kind: 'presence', userId: key, online }));
  };
  if (online) {
    announce().catch(() => {});
  } else {
    // A page refresh drops the connection for a moment; wait a little so friends don't see flicker.
    const t = setTimeout(() => { if (!realtime.isOnline(key)) announce().catch(() => {}); }, 5000);
    t.unref?.();
    offlineTimers.set(key, t);
  }
});

// ── people search ───────────────────────────────────────────────────────
export async function searchUsers(me, q) {
  const term = searchTerm(q);
  if (!term) return { items: [] };
  const hidden = await blockedWith(me);
  const filter = { _id: { $nin: [oid(me), ...hidden.map(oid)] }, status: 'active', discoverable: { $ne: false } };
  if (term.kind === 'email') filter.email = term.value;
  else filter.name = { $regex: escapeRegex(term.value), $options: 'i' };
  const users = await User.find(filter).select('name').sort({ name: 1 }).limit(20).lean();
  if (!users.length) return { items: [] };
  const keys = users.map((u) => pairKey(me, u._id));
  const rows = await Friendship.find({ pairKey: { $in: keys } }).lean();
  const byKey = new Map(rows.map((r) => [r.pairKey, r]));
  return {
    items: users.map((u) => {
      const f = byKey.get(pairKey(me, u._id));
      return { ...publicUser(u), relation: relationOf(f, me), requestId: f ? String(f._id) : null, online: relationOf(f, me) === 'friend' ? realtime.isOnline(u._id) : undefined };
    }),
  };
}

// ── friends ─────────────────────────────────────────────────────────────
export async function listFriends(me) {
  const rows = await Friendship.find({ $or: [{ requesterId: me }, { addresseeId: me }] }).sort({ updatedAt: -1 }).limit(500).lean();
  const otherId = (r) => (String(r.requesterId) === String(me) ? r.addresseeId : r.requesterId);
  const users = await User.find({ _id: { $in: rows.map(otherId) }, status: 'active' }).select('name').lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const out = { friends: [], incoming: [], outgoing: [] };
  for (const r of rows) {
    const u = byId.get(String(otherId(r)));
    if (!u) continue;
    const base = { ...publicUser(u), requestId: String(r._id), since: r.updatedAt };
    if (r.status === 'accepted') out.friends.push({ ...base, online: realtime.isOnline(u._id) });
    else if (String(r.addresseeId) === String(me)) out.incoming.push(base);
    else out.outgoing.push(base);
  }
  out.friends.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function sendRequest(me, targetId) {
  if (String(me) === String(targetId)) throw ApiError.badRequest('You cannot add yourself.');
  const [target, self] = await Promise.all([
    User.findOne({ _id: oid(targetId), status: 'active' }).select('name discoverable').lean(),
    User.findById(me).select('name').lean(),
  ]);
  if (!target) throw ApiError.notFound('That person was not found.');
  const key = pairKey(me, targetId);
  const existing = await Friendship.findOne({ pairKey: key });
  if (existing) {
    if (existing.status === 'accepted') throw new ApiError(409, 'You are already friends.', { code: 'ALREADY_FRIENDS' });
    if (String(existing.requesterId) === String(me)) throw new ApiError(409, 'Request already sent.', { code: 'ALREADY_REQUESTED' });
    // They already asked me: sending a request back simply accepts theirs.
    return acceptRequest(me, existing._id);
  }
  if (target.discoverable === false || (await isBlockedEither(me, targetId))) throw ApiError.notFound('That person was not found.');
  let f;
  try {
    f = await Friendship.create({ requesterId: oid(me), addresseeId: oid(targetId), pairKey: key });
  } catch (err) {
    if (err?.code === 11000) throw new ApiError(409, 'Request already sent.', { code: 'ALREADY_REQUESTED' });
    throw err;
  }
  push(targetId, { kind: 'friend-request', requestId: String(f._id), from: { id: String(me), name: self?.name || 'Someone' } });
  notify(targetId, { type: 'friend_request', title: `${self?.name || 'Someone'} sent you a friend request`, link: '/connect/friends' });
  return { status: 'pending', requestId: String(f._id) };
}

export async function acceptRequest(me, requestId) {
  const f = await Friendship.findOneAndUpdate({ _id: oid(requestId), addresseeId: oid(me), status: 'pending' }, { $set: { status: 'accepted' } }, { new: true });
  if (!f) throw ApiError.notFound('That request is no longer there.');
  const self = await User.findById(me).select('name').lean();
  push(f.requesterId, { kind: 'friend-accepted', userId: String(me), name: self?.name || 'Someone' });
  notify(f.requesterId, { type: 'friend_accepted', title: `${self?.name || 'Someone'} accepted your friend request`, link: '/connect/chats' });
  return { status: 'accepted', requestId: String(f._id) };
}

export async function declineRequest(me, requestId) {
  const r = await Friendship.deleteOne({ _id: oid(requestId), addresseeId: oid(me), status: 'pending' });
  if (!r.deletedCount) throw ApiError.notFound('That request is no longer there.');
  return { removed: true };
}

/** Unfriend, or cancel a request I sent. */
export async function removeFriend(me, otherId) {
  const r = await Friendship.deleteOne({ pairKey: pairKey(me, otherId) });
  if (r.deletedCount) push(otherId, { kind: 'friends-changed' });
  return { removed: Boolean(r.deletedCount) };
}

async function assertFriends(me, otherId) {
  const f = await Friendship.exists({ pairKey: pairKey(me, otherId), status: 'accepted' });
  if (!f) throw new ApiError(403, 'You can only chat with your friends.', { code: 'NOT_FRIENDS' });
}

// ── conversations (private chats and groups) ───────────────────────────
const isGroup = (c) => c.type === 'group';
const memberIds = (c) => c.members.map(String);
const othersOf = (c, me) => memberIds(c).filter((m) => m !== String(me));
const readsOf = (c, userId) => c.reads.find((r) => String(r.userId) === String(userId));
const prefOf = (c, userId) => (c.prefs || []).find((p) => String(p.userId) === String(userId));
const readsOfOthers = (c, me) => c.reads.filter((r) => String(r.userId) !== String(me));
const pushAll = (ids, payload) => ids.forEach((id) => push(id, payload));

export async function loadConversation(me, id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Conversation not found.');
  const c = await ConnectConversation.findOne({ _id: id, members: oid(me) });
  if (!c) throw ApiError.notFound('Conversation not found.'); // same answer for "missing" and "not yours"
  return c;
}

/** May I write in this conversation right now? Private chats need an existing friendship; groups need membership. */
export async function assertCanWrite(c, me) {
  if (isGroup(c)) return;
  await assertFriends(me, othersOf(c, me)[0]);
}

async function namesOf(ids) {
  const users = await User.find({ _id: { $in: ids.map(oid) } }).select('name').lean();
  return new Map(users.map((u) => [String(u._id), u.name]));
}

async function summarize(c, me, names) {
  const mine = readsOf(c, me);
  const unread = await ConnectMessage.countDocuments({
    conversationId: c._id, senderId: { $ne: oid(me) }, kind: { $ne: 'system' }, deletedAt: { $exists: false },
    ...(mine?.readUpTo ? { _id: { $gt: mine.readUpTo } } : {}),
  });
  const last = c.lastMessage?.id ? c.lastMessage : null;
  const lastMine = last && String(last.senderId) === String(me);
  const base = {
    id: String(c._id),
    group: isGroup(c),
    avatar: null,
    last: last?.text ?? '',
    at: last?.at || c.activityAt,
    unread,
    muted: Boolean(prefOf(c, me)?.muted),
    archived: Boolean(prefOf(c, me)?.archived),
    mine: Boolean(lastMine),
    status: lastMine ? statusAmong(last.id, readsOfOthers(c, me)) : undefined,
  };
  if (isGroup(c)) {
    const admins = new Set(c.admins.map(String));
    return {
      ...base,
      name: c.name,
      avatar: c.avatarKey ? `gav:${c._id}:${c.avatarKey.split('/').pop().split('.')[0]}` : null,
      description: c.description || '',
      createdBy: sid(c.createdBy),
      isAdmin: admins.has(String(me)),
      memberCount: c.members.length,
      members: c.members.map((m) => ({ id: String(m), name: names.get(String(m)) || 'Former member', admin: admins.has(String(m)), online: realtime.isOnline(m) })),
    };
  }
  const otherId = othersOf(c, me)[0];
  return { ...base, userId: otherId, name: names.get(otherId) || 'Deleted user', online: realtime.isOnline(otherId) };
}

async function summariesFor(convs, me) {
  const ids = [...new Set(convs.flatMap(memberIds))];
  const names = await namesOf(ids);
  const out = [];
  for (const c of convs) {
    if (!isGroup(c)) {
      const other = othersOf(c, me)[0];
      const u = await User.exists({ _id: oid(other), status: 'active' });
      if (!u) continue;
    }
    out.push(await summarize(c, me, names));
  }
  return out;
}

export async function listConversations(me) {
  const convs = await ConnectConversation.find({ members: oid(me) }).sort({ activityAt: -1 }).limit(150);
  const items = await summariesFor(convs, me);
  for (const c of convs) {
    // Opening the app counts as "delivered" for anything someone else sent.
    const lm = c.lastMessage;
    const mine = readsOf(c, me);
    if (lm?.id && String(lm.senderId) !== String(me) && !idGte(mine?.deliveredUpTo, lm.id)) await markDelivered(me, c._id).catch(() => {});
  }
  return { items };
}

async function summaryOne(c, me) {
  return (await summariesFor([c], me))[0];
}

export async function openConversation(me, userId) {
  if (String(me) === String(userId)) throw ApiError.badRequest('You cannot chat with yourself.');
  const other = await User.findOne({ _id: oid(userId), status: 'active' }).select('name').lean();
  if (!other) throw ApiError.notFound('That person was not found.');
  await assertFriends(me, userId);
  const key = pairKey(me, userId);
  let c = await ConnectConversation.findOne({ pairKey: key });
  if (!c) {
    try {
      c = await ConnectConversation.create({ pairKey: key, members: [oid(me), oid(userId)], reads: [{ userId: oid(me) }, { userId: oid(userId) }] });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      c = await ConnectConversation.findOne({ pairKey: key });
    }
  }
  return summaryOne(c, me);
}

// ── groups ──────────────────────────────────────────────────────────────
async function loadGroup(me, id, { admin = false } = {}) {
  const c = await loadConversation(me, id);
  if (!isGroup(c)) throw ApiError.badRequest('This is not a group.');
  if (admin && !c.admins.some((a) => String(a) === String(me))) throw ApiError.forbidden('Only group admins can do that.');
  return c;
}

async function onlyMyFriends(me, ids) {
  const unique = [...new Set(ids.map(String))].filter((x) => x !== String(me));
  if (!unique.length) return [];
  const rows = await Friendship.find({ pairKey: { $in: unique.map((x) => pairKey(me, x)) }, status: 'accepted' }).select('pairKey').lean();
  const ok = new Set(rows.map((r) => r.pairKey));
  const bad = unique.filter((x) => !ok.has(pairKey(me, x)));
  if (bad.length) throw new ApiError(403, 'You can only add your friends.', { code: 'NOT_FRIENDS' });
  return unique;
}

async function systemMessage(c, actorId, text) {
  const m = await ConnectMessage.create({ conversationId: c._id, senderId: oid(actorId), kind: 'system', text });
  await ConnectConversation.updateOne({ _id: c._id }, { $set: { activityAt: m.createdAt } });
  pushAll(othersOf(c, actorId), { kind: 'message', conversationId: String(c._id), message: toDto(m.toObject(), null), from: { id: String(actorId), name: '' } });
  return m;
}

const changed = (c, extraIds = []) => pushAll([...new Set([...memberIds(c), ...extraIds.map(String)])], { kind: 'conversation-changed', conversationId: String(c._id) });

export async function createGroup(me, { name, description, memberIds: ids = [] }) {
  const clean = cleanGroupName(name);
  if (!clean) throw ApiError.badRequest('Give the group a name.');
  const others = await onlyMyFriends(me, ids);
  if (!others.length) throw ApiError.badRequest('Pick at least one friend to add.');
  if (others.length + 1 > GROUP_MAX) throw ApiError.badRequest(`A group can have up to ${GROUP_MAX} people.`);
  const _id = new mongoose.Types.ObjectId();
  const all = [String(me), ...others];
  const c = await ConnectConversation.create({
    _id, type: 'group', pairKey: `group:${_id}`, name: clean, description: cleanText(description || '', 300),
    createdBy: oid(me), admins: [oid(me)], members: all.map(oid), reads: all.map((u) => ({ userId: oid(u) })),
  });
  const self = await User.findById(me).select('name').lean();
  await systemMessage(c, me, `${self?.name || 'Someone'} created the group`);
  changed(c);
  notifyMany(others, { type: 'group_added', title: `${self?.name || 'Someone'} added you to a group`, body: clean, link: `/connect/chats/${c._id}`, conversationId: c._id });
  return summaryOne(c, me);
}

export async function updateGroup(me, id, { name, description }) {
  const c = await loadGroup(me, id, { admin: true });
  if (name !== undefined) {
    const clean = cleanGroupName(name);
    if (!clean) throw ApiError.badRequest('The group needs a name.');
    c.name = clean;
  }
  if (description !== undefined) c.description = cleanText(description, 300);
  await c.save();
  changed(c);
  return summaryOne(c, me);
}

export async function addMembers(me, id, userIds = []) {
  const c = await loadGroup(me, id, { admin: true });
  const fresh = (await onlyMyFriends(me, userIds)).filter((u) => !memberIds(c).includes(u));
  if (!fresh.length) throw ApiError.badRequest('Those people are already in the group.');
  if (c.members.length + fresh.length > GROUP_MAX) throw ApiError.badRequest(`A group can have up to ${GROUP_MAX} people.`);
  const names = await namesOf([me, ...fresh]);
  c.members.push(...fresh.map(oid));
  // A new member starts reading from now: everything already in the group counts as read for them.
  const upTo = c.lastMessage?.id;
  c.reads.push(...fresh.map((u) => ({ userId: oid(u), readUpTo: upTo, deliveredUpTo: upTo })));
  await c.save();
  await systemMessage(c, me, `${names.get(String(me))} added ${fresh.map((u) => names.get(u)).join(', ')}`);
  changed(c);
  notifyMany(fresh, { type: 'group_added', title: `${names.get(String(me))} added you to a group`, body: c.name || '', link: `/connect/chats/${c._id}`, conversationId: c._id });
  return summaryOne(c, me);
}

/** Remove someone (admins), or leave the group yourself (anyone). Returns the new summary, or { left: true }. */
export async function removeMember(me, id, userId) {
  const c = await loadGroup(me, id);
  const target = String(userId);
  if (!memberIds(c).includes(target)) throw ApiError.notFound('That person is not in the group.');
  const self = target === String(me);
  if (!self) {
    if (!c.admins.some((a) => String(a) === String(me))) throw ApiError.forbidden('Only group admins can remove people.');
    if (sid(c.createdBy) === target) throw ApiError.forbidden('The person who created the group cannot be removed.');
  }
  const names = await namesOf([me, target]);
  const before = memberIds(c);
  c.members = c.members.filter((m) => String(m) !== target);
  c.reads = c.reads.filter((r) => String(r.userId) !== target);
  c.admins = c.admins.filter((a) => String(a) !== target);
  if (c.members.length === 0) {
    await purgeConversation(c);
    return { left: true };
  }
  if (c.admins.length === 0) c.admins = [c.members[0]]; // never leave a group without an admin
  await c.save();
  const actor = self ? target : String(me);
  await systemMessage(c, actor, self ? `${names.get(target)} left` : `${names.get(String(me))} removed ${names.get(target)}`);
  pushAll(before, { kind: 'conversation-changed', conversationId: String(c._id) });
  return self ? { left: true } : summaryOne(c, me);
}

export async function setAdmin(me, id, userId, makeAdmin) {
  const c = await loadGroup(me, id, { admin: true });
  const target = String(userId);
  if (!memberIds(c).includes(target)) throw ApiError.notFound('That person is not in the group.');
  if (!makeAdmin && sid(c.createdBy) === target) throw ApiError.forbidden('The creator of the group always stays an admin.');
  const has = c.admins.some((a) => String(a) === target);
  if (makeAdmin && !has) c.admins.push(oid(target));
  if (!makeAdmin && has) c.admins = c.admins.filter((a) => String(a) !== target);
  await c.save();
  changed(c);
  return summaryOne(c, me);
}

async function purgeConversation(c) {
  const files = await ConnectMessage.find({ conversationId: c._id, 'attachment.key': { $exists: true } }).select('attachment.key').lean();
  await Promise.all(files.map((f) => storage.deleteObject(f.attachment.key).catch(() => {})));
  await ConnectMessage.deleteMany({ conversationId: c._id });
  await ConnectConversation.deleteOne({ _id: c._id });
}

// ── messages ────────────────────────────────────────────────────────────
function toDto(m, others, replyMap) {
  const deleted = Boolean(m.deletedAt);
  const reply = m.replyToId ? replyMap?.get(String(m.replyToId)) : null;
  const kind = m.kind || 'text';
  return {
    id: String(m._id),
    conversationId: String(m.conversationId),
    senderId: String(m.senderId),
    kind,
    text: deleted ? '' : m.text,
    attachment: !deleted && m.attachment?.key ? { name: m.attachment.name, mime: m.attachment.mime, size: m.attachment.size } : null,
    contact: !deleted && m.contact?.userId ? { userId: String(m.contact.userId), name: m.contact.name } : null,
    resource: !deleted && m.resource?.type ? { type: m.resource.type, title: m.resource.title, subtitle: m.resource.subtitle } : null,
    deleted,
    reactions: deleted ? [] : (m.reactions || []).map((r) => ({ u: String(r.userId), e: r.emoji })),
    forwarded: !deleted && Boolean(m.forwarded),
    mentions: deleted ? [] : (m.mentions || []).map((x) => ({ id: String(x.userId), name: x.name })),
    at: m.createdAt,
    edited: Boolean(m.editedAt) && !deleted,
    replyTo: reply ? { id: String(reply._id), senderId: String(reply.senderId), text: previewOf(reply).slice(0, 120) } : null,
    status: others ? statusAmong(m._id, others) : undefined,
  };
}

async function replyMapFor(conversationId, messages) {
  const ids = [...new Set(messages.map((m) => sid(m.replyToId)).filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await ConnectMessage.find({ _id: { $in: ids }, conversationId }).select('senderId text kind attachment.name contact.name resource.type resource.title deletedAt').lean();
  return new Map(rows.map((r) => [String(r._id), r]));
}

export async function listMessages(me, conversationId, { before, limit = 50 } = {}) {
  const c = await loadConversation(me, conversationId);
  const filter = { conversationId: c._id };
  if (before && mongoose.isValidObjectId(before)) filter._id = { $lt: oid(before) };
  const rows = await ConnectMessage.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  const others = readsOfOthers(c, me);
  const replies = await replyMapFor(c._id, page);
  return { items: page.map((m) => toDto(m, String(m.senderId) === String(me) ? others : null, replies)), hasMore };
}

/** "Amara shared a file: plan.pdf" for everyone else in the chat. */
async function notifyShare(c, me, type, what) {
  const sender = await User.findById(me).select('name').lean();
  await notifyMany(othersOf(c, me).filter((u) => !prefOf(c, u)?.muted), { type, title: `${sender?.name || 'Someone'} ${what}`, body: isGroup(c) ? c.name || '' : '', link: `/connect/chats/${c._id}`, conversationId: c._id });
}

/** Saves a message, updates the chat list line, and tells everybody else in the conversation. */
async function createMessage(c, me, fields, replyToId) {
  let reply = null;
  if (replyToId && mongoose.isValidObjectId(replyToId)) {
    reply = await ConnectMessage.findOne({ _id: replyToId, conversationId: c._id }).select('senderId text kind attachment.name contact.name resource.type resource.title deletedAt').lean();
  }
  const m = await ConnectMessage.create({ conversationId: c._id, senderId: oid(me), ...fields, ...(reply ? { replyToId: reply._id } : {}) });
  const sender = await User.findById(me).select('name').lean();
  const line = previewOf(m);
  const shown = isGroup(c) ? `${(sender?.name || '').split(' ')[0]}: ${line}` : line;
  await ConnectConversation.updateOne(
    { _id: c._id },
    { $set: { lastMessage: { id: m._id, text: shown.slice(0, 200), senderId: m.senderId, at: m.createdAt }, activityAt: m.createdAt } }
  );
  await ConnectConversation.updateOne({ _id: c._id, 'reads.userId': oid(me) }, { $max: { 'reads.$.readUpTo': m._id, 'reads.$.deliveredUpTo': m._id } });
  // A new message brings an archived chat back for the others (unless they muted it).
  await ConnectConversation.updateOne({ _id: c._id }, { $set: { 'prefs.$[p].archived': false } }, { arrayFilters: [{ 'p.archived': true, 'p.muted': { $ne: true }, 'p.userId': { $ne: oid(me) } }] }).catch(() => {});
  const fresh = await ConnectConversation.findById(c._id).select('reads').lean();
  const dto = toDto(m.toObject(), readsOfOthers(fresh, me), new Map(reply ? [[String(reply._id), reply]] : []));
  pushAll(othersOf(c, me), { kind: 'message', conversationId: String(c._id), message: { ...dto, status: undefined }, from: { id: String(me), name: sender?.name || 'Someone' } });
  for (const uid of othersOf(c, me)) {
    const muted = (c.prefs || []).some((p) => String(p.userId) === String(uid) && p.muted);
    if (!muted) pushToUser(uid, { title: isGroup(c) ? `${c.name || 'Group'}` : sender?.name || 'New message', body: line, url: '/connect/chats', tag: `chat-${c._id}` });
  }
  return dto;
}

export async function sendMessage(me, conversationId, { text, replyToId, mentions = [] }) {
  const c = await loadConversation(me, conversationId);
  await assertCanWrite(c, me);
  const clean = cleanText(text);
  if (!clean) throw ApiError.badRequest('Write a message first.');
  if (!allowSend(String(me))) throw new ApiError(429, 'You are sending messages too fast.', { code: 'RATE_LIMITED' });
  // @mentions only make sense in groups, and only for people who are really members.
  let tagged = [];
  if (isGroup(c) && Array.isArray(mentions) && mentions.length) {
    const ids = [...new Set(mentions.map(String))].filter((u) => memberIds(c).includes(u) && u !== String(me)).slice(0, 10);
    const names = await namesOf(ids);
    tagged = ids.map((u) => ({ userId: oid(u), name: names.get(u) || 'Someone' })).filter((t) => clean.includes(`@${t.name}`));
  }
  const dto = await createMessage(c, me, { kind: 'text', text: clean, ...(tagged.length ? { mentions: tagged } : {}) }, replyToId);
  if (tagged.length) {
    const sender = await User.findById(me).select('name').lean();
    // A mention reaches the person even if they muted the group.
    await notifyMany(tagged.map((t) => String(t.userId)), { type: 'mention', title: `${sender?.name || 'Someone'} mentioned you in ${c.name || 'a group'}`, body: clean.slice(0, 120), link: `/connect/chats/${c._id}`, conversationId: c._id });
  }
  return dto;
}

/** A photo, video, audio file or document. `file` = { originalname, buffer }. */
export async function sendAttachment(me, conversationId, file, { caption, replyToId, voice = false } = {}) {
  const c = await loadConversation(me, conversationId);
  await assertCanWrite(c, me);
  if (!file?.buffer) throw ApiError.badRequest('Choose a file to send.');
  if (file.buffer.length > MAX_UPLOAD_BYTES) throw new ApiError(413, `Files can be up to ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB.`, { code: 'PAYLOAD_TOO_LARGE' });
  if (!allowUpload(String(me))) throw new ApiError(429, 'You are sending files too fast.', { code: 'RATE_LIMITED' });
  const info = inspectFile(file.originalname, file.buffer, { voice });
  if (info.error) throw ApiError.badRequest(info.error, { code: 'FILE_REJECTED' });
  const _id = new mongoose.Types.ObjectId();
  const key = `connect/${c._id}/${_id}-${crypto.randomBytes(6).toString('hex')}.${info.ext}`;
  await storage.putObject(key, file.buffer, info.mime);
  try {
    const dto = await createMessage(c, me, {
      _id, kind: info.kind, text: cleanText(caption || '', 1000),
      attachment: { key, name: info.voice ? `voice-note.${info.ext}` : safeName(file.originalname), mime: info.mime, size: file.buffer.length },
    }, replyToId);
    if (info.kind === 'file' || info.kind === 'audio') await notifyShare(c, me, 'shared_file', `shared a file: ${safeName(file.originalname)}`);
    return dto;
  } catch (err) {
    await storage.deleteObject(key).catch(() => {});
    throw err;
  }
}

/** Share one of MY friends as a contact card. */
export async function sendContact(me, conversationId, userId, replyToId) {
  const c = await loadConversation(me, conversationId);
  await assertCanWrite(c, me);
  if (String(userId) === String(me)) throw ApiError.badRequest('Pick a friend to share.');
  const [friend] = await onlyMyFriends(me, [userId]);
  const u = friend && await User.findOne({ _id: oid(friend), status: 'active' }).select('name').lean();
  if (!u) throw ApiError.notFound('That person was not found.');
  if (!allowSend(String(me))) throw new ApiError(429, 'You are sending messages too fast.', { code: 'RATE_LIMITED' });
  return createMessage(c, me, { kind: 'contact', text: '', contact: { userId: u._id, name: u.name } }, replyToId);
}

/** Shares a snapshot of a LifeOS item (built by connectResources.service) as a chat message. */
export async function sendResource(me, conversationId, resource, replyToId) {
  const c = await loadConversation(me, conversationId);
  await assertCanWrite(c, me);
  if (!allowSend(String(me))) throw new ApiError(429, 'You are sending messages too fast.', { code: 'RATE_LIMITED' });
  const dto = await createMessage(c, me, { kind: 'resource', text: '', resource }, replyToId);
  await notifyShare(c, me, 'shared_item', `shared ${resource.type === 'event' ? 'an' : 'a'} ${resource.type}: ${resource.title}`);
  return dto;
}

/** A resource message, if I am a member of its conversation. */
export async function loadResourceMessage(me, messageId) {
  if (!mongoose.isValidObjectId(messageId)) throw ApiError.notFound('Item not found.');
  const m = await ConnectMessage.findById(messageId);
  if (!m || m.deletedAt || m.kind !== 'resource' || !m.resource?.type) throw ApiError.notFound('Item not found.');
  const ok = await ConnectConversation.exists({ _id: m.conversationId, members: oid(me) });
  if (!ok) throw ApiError.notFound('Item not found.');
  return m;
}

async function ownMessage(me, messageId) {
  if (!mongoose.isValidObjectId(messageId)) throw ApiError.notFound('Message not found.');
  const m = await ConnectMessage.findById(messageId);
  if (!m) throw ApiError.notFound('Message not found.');
  const c = await ConnectConversation.findOne({ _id: m.conversationId, members: oid(me) });
  if (!c) throw ApiError.notFound('Message not found.');
  if (String(m.senderId) !== String(me)) throw ApiError.forbidden('You can only change your own messages.');
  if (m.deletedAt || m.kind === 'system') throw ApiError.notFound('Message not found.');
  return { m, c };
}

export async function editMessage(me, messageId, text) {
  const { m, c } = await ownMessage(me, messageId);
  if (!['text', 'image', 'video', 'file', 'audio'].includes(m.kind || 'text')) throw ApiError.badRequest('This message cannot be edited.');
  const clean = cleanText(text, m.kind && m.kind !== 'text' ? 1000 : undefined);
  if (!clean && (m.kind || 'text') === 'text') throw ApiError.badRequest('A message cannot be empty. Delete it instead.');
  m.text = clean;
  m.editedAt = new Date();
  await m.save();
  if (c.lastMessage?.id && String(c.lastMessage.id) === String(m._id)) {
    const sender = await User.findById(me).select('name').lean();
    const line = previewOf(m);
    await ConnectConversation.updateOne({ _id: c._id }, { $set: { 'lastMessage.text': (isGroup(c) ? `${(sender?.name || '').split(' ')[0]}: ${line}` : line).slice(0, 200) } });
  }
  const dto = toDto(m.toObject(), readsOfOthers(c, me));
  pushAll(othersOf(c, me), { kind: 'message-edited', conversationId: String(c._id), message: { ...dto, status: undefined } });
  return dto;
}

export async function deleteMessage(me, messageId) {
  const { m, c } = await ownMessage(me, messageId);
  const key = m.attachment?.key;
  m.deletedAt = new Date();
  m.text = '';
  m.attachment = undefined;
  m.contact = undefined;
  m.resource = undefined;
  await m.save();
  if (key) storage.deleteObject(key).catch(() => {});
  if (c.lastMessage?.id && String(c.lastMessage.id) === String(m._id)) {
    await ConnectConversation.updateOne({ _id: c._id }, { $set: { 'lastMessage.text': 'Message deleted' } });
  }
  pushAll(othersOf(c, me), { kind: 'message-deleted', conversationId: String(c._id), messageId: String(m._id) });
  return { deleted: true };
}

/** Opens a stored file for a member of the conversation. Returns what the controller needs to stream it. */
export async function openAttachment(me, messageId, range) {
  if (!mongoose.isValidObjectId(messageId)) throw ApiError.notFound('File not found.');
  const m = await ConnectMessage.findById(messageId).select('conversationId attachment deletedAt').lean();
  if (!m || m.deletedAt || !m.attachment?.key) throw ApiError.notFound('File not found.');
  const ok = await ConnectConversation.exists({ _id: m.conversationId, members: oid(me) });
  if (!ok) throw ApiError.notFound('File not found.');
  const obj = await storage.getObject(m.attachment.key, range);
  const mime = m.attachment.mime || 'application/octet-stream';
  const inline = /^(image|video|audio)\//.test(mime) || mime === 'application/pdf';
  return { ...obj, name: m.attachment.name, mime, inline };
}

/** Photos, videos and documents shared in my conversations, newest first. */
export async function listSharedFiles(me, { type = 'media', before, limit = 40, conversationId } = {}) {
  const convs = await ConnectConversation.find({ members: oid(me), ...(conversationId && mongoose.isValidObjectId(conversationId) ? { _id: oid(conversationId) } : {}) }).select('name type members').lean();
  if (!convs.length) return { items: [], hasMore: false };
  const kinds = type === 'docs' ? ['file', 'audio'] : ['image', 'video'];
  const filter = { conversationId: { $in: convs.map((c) => c._id) }, kind: { $in: kinds }, deletedAt: { $exists: false }, 'attachment.key': { $exists: true } };
  if (before && mongoose.isValidObjectId(before)) filter._id = { $lt: oid(before) };
  const rows = await ConnectMessage.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  const names = await namesOf([...new Set([...convs.flatMap(memberIds), ...rows.map((r) => String(r.senderId))])]);
  const byConv = new Map(convs.map((c) => [String(c._id), c]));
  return {
    hasMore: rows.length > limit,
    items: rows.slice(0, limit).map((m) => {
      const c = byConv.get(String(m.conversationId));
      const chatName = c.type === 'group' ? c.name : names.get(memberIds(c).find((x) => x !== String(me))) || 'Chat';
      return { ...toDto(m, null), conversationName: chatName, senderName: names.get(String(m.senderId)) || '' };
    }),
  };
}

// ── receipts, typing, summary ───────────────────────────────────────────
async function latestFromOthers(c, me) {
  const m = await ConnectMessage.findOne({ conversationId: c._id, senderId: { $ne: oid(me) }, kind: { $ne: 'system' } }).sort({ _id: -1 }).select('_id').lean();
  return m?._id || null;
}

/** After `me` reads/receives something, tell each other member how far EVERYONE (except themselves) has got. */
async function sendReceipts(c, me, field, status) {
  const fresh = await ConnectConversation.findById(c._id).select('reads members').lean();
  for (const s of memberIds(fresh).filter((m) => m !== String(me))) {
    const upTo = minId(fresh.reads.filter((r) => String(r.userId) !== s).map((r) => r[field]));
    if (upTo) push(s, { kind: 'receipt', conversationId: String(c._id), status, upTo: String(upTo) });
  }
}

export async function markRead(me, conversationId) {
  const c = await loadConversation(me, conversationId);
  clearForConversation(me, c._id);
  const upTo = await latestFromOthers(c, me);
  if (!upTo) return { upTo: null };
  await ConnectConversation.updateOne({ _id: c._id, 'reads.userId': oid(me) }, { $max: { 'reads.$.readUpTo': upTo, 'reads.$.deliveredUpTo': upTo } });
  await sendReceipts(c, me, 'readUpTo', 'read');
  return { upTo: String(upTo) };
}

export async function markDelivered(me, conversationId) {
  const c = await loadConversation(me, conversationId);
  const upTo = await latestFromOthers(c, me);
  if (!upTo) return { upTo: null };
  await ConnectConversation.updateOne({ _id: c._id, 'reads.userId': oid(me) }, { $max: { 'reads.$.deliveredUpTo': upTo } });
  await sendReceipts(c, me, 'deliveredUpTo', 'delivered');
  return { upTo: String(upTo) };
}

export async function typing(me, conversationId) {
  const c = await loadConversation(me, conversationId);
  pushAll(othersOf(c, me), { kind: 'typing', conversationId: String(c._id), userId: String(me) });
  return { ok: true };
}

export async function summary(me) {
  const convs = await ConnectConversation.find({ members: oid(me) }).select('reads type prefs').lean();
  let unread = 0;
  await Promise.all(convs.filter((c) => !prefOf(c, me)?.muted).map(async (c) => {
    const mine = c.reads.find((r) => String(r.userId) === String(me));
    unread += await ConnectMessage.countDocuments({
      conversationId: c._id, senderId: { $ne: oid(me) }, kind: { $ne: 'system' }, deletedAt: { $exists: false },
      ...(mine?.readUpTo ? { _id: { $gt: mine.readUpTo } } : {}),
    });
  }));
  const [friends, requests] = await Promise.all([
    Friendship.countDocuments({ status: 'accepted', $or: [{ requesterId: oid(me) }, { addresseeId: oid(me) }] }),
    Friendship.countDocuments({ status: 'pending', addresseeId: oid(me) }),
  ]);
  return { unread, friends, requests, groups: convs.filter((c) => c.type === 'group').length, meetings: 0 };
}

// Used by connectExtras.service.js
export { loadGroup, changed, toDto, createMessage, othersOf, memberIds, isGroup, allowSend, prefOf };
