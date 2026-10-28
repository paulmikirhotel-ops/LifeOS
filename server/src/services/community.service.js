import mongoose from 'mongoose';
import { User, ConnectConversation, ConnectMessage } from '../models/index.js';
import { CommunityProfile, StudyGroup, CommunityRequest, CommunityReport } from '../models/community.model.js';
import { ApiError } from '../utils/ApiError.js';
import { isBlockedEither, blockedWith } from './connectSafety.service.js';
import { notify } from './connectNotify.service.js';
import { openConversation } from './connect.service.js';
import {
  LIMITS, cleanLine, cleanTags, isListable, canView, matchesQuery, mayPublish, shouldHide,
} from '../utils/community.logic.js';

/**
 * Community: Skill Exchange (mentors and study groups). Per person, not per workspace, like Connect.
 * Chat, calls, blocking and notifications all go through Connect; this file only adds the listings and the agreement step.
 * Nothing about a person is visible until they switch their profile on. Contact details are never stored or shown.
 */
import { oid, DAY, needId, guardContact, nameOf, push, friendSet, activeUsers, ensureFriends } from './communityShared.js';
import * as impact from './impact.service.js';

// ───────────────────────── My profile ─────────────────────────

const profileDto = (p) => ({
  enabled: Boolean(p?.enabled), displayName: p?.displayName || '', intro: p?.intro || '', offers: p?.offers || [], wants: p?.wants || [],
  language: p?.language || '', availability: p?.availability || '', audience: p?.audience || 'friends', hidden: Boolean(p?.hidden),
});

export async function getMine(me) {
  const [p, incomingA, incomingB] = await Promise.all([
    CommunityProfile.findOne({ userId: oid(me) }).lean(),
    CommunityRequest.countDocuments({ toId: oid(me), status: 'pending' }),
    impact.countIncoming(me),
  ]);
  const incoming = incomingA + incomingB;
  return { profile: profileDto(p), incoming, limits: { requestsPerDay: LIMITS.requestsPerDay, openGroups: LIMITS.openGroupsPerUser } };
}

export async function saveProfile(me, body) {
  const cur = (await CommunityProfile.findOne({ userId: oid(me) }).lean()) || {};
  const next = {
    displayName: body.displayName !== undefined ? cleanLine(body.displayName, 40) : cur.displayName || '',
    intro: body.intro !== undefined ? cleanLine(body.intro, 300) : cur.intro || '',
    offers: body.offers !== undefined ? cleanTags(body.offers) : cur.offers || [],
    wants: body.wants !== undefined ? cleanTags(body.wants) : cur.wants || [],
    language: body.language !== undefined ? cleanLine(body.language, 40) : cur.language || '',
    availability: body.availability !== undefined ? cleanLine(body.availability, 80) : cur.availability || '',
    audience: body.audience || cur.audience || 'friends',
    enabled: body.enabled !== undefined ? Boolean(body.enabled) : Boolean(cur.enabled),
  };
  guardContact({ n: next.displayName, i: next.intro, o: next.offers, w: next.wants, l: next.language, a: next.availability });
  if (next.enabled) {
    if (next.displayName.length < 2) throw ApiError.badRequest('Choose a display name before you switch your profile on.');
    if (!next.offers.length && !next.wants.length) throw ApiError.badRequest('Add at least one skill you can offer or want to learn.');
  }
  const p = await CommunityProfile.findOneAndUpdate({ userId: oid(me) }, { $set: next, $setOnInsert: { userId: oid(me) } }, { upsert: true, new: true });
  return { profile: profileDto(p.toObject()) };
}

// ───────────────────────── Mentors ─────────────────────────

export async function listMentors(me, { q } = {}) {
  const [profiles, friends, blocked, pending] = await Promise.all([
    CommunityProfile.find({ enabled: true, hidden: false, userId: { $ne: oid(me) }, 'offers.0': { $exists: true } }).sort({ updatedAt: -1 }).limit(300).lean(),
    friendSet(me),
    blockedWith(me),
    CommunityRequest.find({ fromId: oid(me), kind: 'mentor', status: 'pending' }).select('toId').lean(),
  ]);
  const blockedSet = new Set(blocked);
  const pendingSet = new Set(pending.map((r) => String(r.toId)));
  const alive = await activeUsers(profiles.map((p) => p.userId));
  const items = profiles
    .filter((p) => alive.has(String(p.userId)) && isListable(p))
    .filter((p) => canView({ audience: p.audience, isFriend: friends.has(String(p.userId)), blocked: blockedSet.has(String(p.userId)) }))
    .filter((p) => matchesQuery([p.displayName, p.offers, p.wants, p.intro], q))
    .slice(0, 40);
  const hours = await impact.sharedHoursFor(items.map((p) => p.userId));
  return { items: items.map((p) => ({
      sharedHours: hours.get(String(p.userId)) || 0,
      userId: String(p.userId), displayName: p.displayName, intro: p.intro, offers: p.offers, wants: p.wants, language: p.language,
      availability: p.availability, isFriend: friends.has(String(p.userId)), requested: pendingSet.has(String(p.userId)),
    })) };
}

async function assertDailyRequests(me) {
  const since = new Date(Date.now() - DAY);
  if ((await CommunityRequest.countDocuments({ fromId: oid(me), createdAt: { $gte: since } })) >= LIMITS.requestsPerDay) {
    throw new ApiError(429, `You can send up to ${LIMITS.requestsPerDay} requests a day. Please try again tomorrow.`, { code: 'RATE_LIMITED' });
  }
  if ((await CommunityRequest.countDocuments({ fromId: oid(me), status: 'pending' })) >= LIMITS.pendingRequests) {
    throw new ApiError(429, 'You have many open requests. Wait for answers or cancel some first.', { code: 'RATE_LIMITED' });
  }
}

export async function requestSession(me, userId, message) {
  needId(userId, 'That person');
  if (String(me) === String(userId)) throw ApiError.badRequest('You cannot send a request to yourself.');
  const clean = cleanLine(message || '', 200);
  guardContact({ m: clean });
  const [p, friends] = await Promise.all([CommunityProfile.findOne({ userId: oid(userId) }).lean(), friendSet(me)]);
  const blocked = await isBlockedEither(me, userId);
  const alive = await activeUsers([userId]);
  const visible = p && alive.has(String(userId)) && isListable(p) && p.offers.length && canView({ audience: p.audience, isFriend: friends.has(String(userId)), blocked });
  if (!visible) throw ApiError.notFound('That mentor is not available.');
  await assertDailyRequests(me);
  let r;
  try {
    r = await CommunityRequest.create({ kind: 'mentor', fromId: oid(me), toId: oid(userId), message: clean });
  } catch (err) {
    if (err?.code === 11000) throw ApiError.conflict('You already have an open request to this person.');
    throw err;
  }
  const mine = await CommunityProfile.findOne({ userId: oid(me) }).lean();
  notify(userId, { type: 'community_request', title: `${nameOf(mine)} asked for a mentoring session`, body: clean, link: '/community?tab=requests' });
  return { requestId: String(r._id), status: 'pending' };
}

// ───────────────────────── Study groups ─────────────────────────

const groupDto = (g, { me, ownerProfile, pending, friends }) => ({
  id: String(g._id), title: g.title, topic: g.topic, description: g.description, language: g.language, audience: g.audience,
  status: g.status, maxMembers: g.maxMembers, memberCount: g.members.length, nextSessionAt: g.nextSessionAt || null,
  ownerName: nameOf(ownerProfile), isOwner: String(g.ownerId) === String(me), isMember: g.members.some((m) => String(m) === String(me)),
  requested: pending.has(String(g._id)), conversationId: g.members.some((m) => String(m) === String(me)) && g.conversationId ? String(g.conversationId) : null,
  full: g.members.length >= g.maxMembers, ownerIsFriend: friends.has(String(g.ownerId)),
});

export async function listGroups(me, { q, mine } = {}) {
  const [friends, blocked, pendingRows] = await Promise.all([
    friendSet(me),
    blockedWith(me),
    CommunityRequest.find({ fromId: oid(me), kind: 'group', status: 'pending' }).select('groupId').lean(),
  ]);
  const blockedSet = new Set(blocked);
  const pending = new Set(pendingRows.map((r) => String(r.groupId)));
  const filter = mine ? { members: oid(me), status: { $ne: 'hidden' } } : { status: 'open' };
  const groups = await StudyGroup.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  const owners = await CommunityProfile.find({ userId: { $in: groups.map((g) => g.ownerId) } }).lean();
  const ownerById = new Map(owners.map((o) => [String(o.userId), o]));
  const alive = await activeUsers(groups.map((g) => g.ownerId));
  const items = groups
    .filter((g) => mine || (alive.has(String(g.ownerId)) && canView({ audience: g.audience, isFriend: friends.has(String(g.ownerId)), blocked: blockedSet.has(String(g.ownerId)), isOwner: String(g.ownerId) === String(me) })))
    .filter((g) => matchesQuery([g.title, g.topic, g.description], q))
    .slice(0, 40)
    .map((g) => groupDto(g, { me, ownerProfile: ownerById.get(String(g.ownerId)), pending, friends }));
  return { items };
}

async function systemMessage(conversation, actorId, text) {
  const m = await ConnectMessage.create({ conversationId: conversation._id, senderId: oid(actorId), kind: 'system', text: String(text).slice(0, 300) });
  await ConnectConversation.updateOne({ _id: conversation._id }, { $set: { activityAt: m.createdAt } });
  return m;
}
const changed = (conversationId, memberIds) => memberIds.forEach((id) => push(id, { kind: 'conversation-changed', conversationId: String(conversationId) }));

export async function createGroup(me, body) {
  const [mine, user] = await Promise.all([CommunityProfile.findOne({ userId: oid(me) }).lean(), User.findById(me).select('createdAt').lean()]);
  if (!mine?.enabled || !mine.displayName) throw ApiError.badRequest('Switch on your community profile (with a display name) before you start a group.');
  const gate = mayPublish(user?.createdAt);
  if (!gate.ok) throw new ApiError(403, `New accounts can start groups after ${gate.readyAt.toISOString().slice(0, 16).replace('T', ' ')} UTC. You can already join groups and request mentors.`, { code: 'NEW_ACCOUNT' });
  const title = cleanLine(body.title, 80);
  const topic = cleanLine(body.topic || '', 60);
  const description = cleanLine(body.description || '', 400);
  guardContact({ t: title, p: topic, d: description });
  if ((await StudyGroup.countDocuments({ ownerId: oid(me), createdAt: { $gte: new Date(Date.now() - DAY) } })) >= LIMITS.groupsPerDay) {
    throw new ApiError(429, `You can start up to ${LIMITS.groupsPerDay} groups a day.`, { code: 'RATE_LIMITED' });
  }
  if ((await StudyGroup.countDocuments({ ownerId: oid(me), status: { $in: ['open', 'hidden'] } })) >= LIMITS.openGroupsPerUser) {
    throw new ApiError(429, `You can have up to ${LIMITS.openGroupsPerUser} open groups. Close one first.`, { code: 'RATE_LIMITED' });
  }
  const gid = new mongoose.Types.ObjectId();
  const cid = new mongoose.Types.ObjectId();
  const convo = await ConnectConversation.create({
    _id: cid, type: 'group', pairKey: `group:${cid}`, name: title.slice(0, 60), description: description.slice(0, 300),
    createdBy: oid(me), admins: [oid(me)], members: [oid(me)], reads: [{ userId: oid(me) }],
  });
  const g = await StudyGroup.create({
    _id: gid, ownerId: oid(me), title, topic, description, language: cleanLine(body.language || '', 40), audience: body.audience || 'friends',
    maxMembers: body.maxMembers || LIMITS.groupMembersDefault, nextSessionAt: body.nextSessionAt ? new Date(body.nextSessionAt) : undefined,
    members: [oid(me)], conversationId: cid,
  });
  await systemMessage(convo, me, 'Study group created');
  changed(cid, [me]);
  return { group: groupDto(g.toObject(), { me, ownerProfile: mine, pending: new Set(), friends: new Set() }) };
}

async function ownGroup(me, id) {
  needId(id, 'Group');
  const g = await StudyGroup.findOne({ _id: id, ownerId: oid(me) });
  if (!g) throw ApiError.notFound('Group not found.');
  return g;
}

export async function updateGroup(me, id, patch) {
  const g = await ownGroup(me, id);
  if (g.status === 'hidden') throw ApiError.forbidden('This group is hidden pending review.');
  const text = {};
  if (patch.title !== undefined) text.title = cleanLine(patch.title, 80);
  if (patch.topic !== undefined) text.topic = cleanLine(patch.topic, 60);
  if (patch.description !== undefined) text.description = cleanLine(patch.description, 400);
  if (patch.language !== undefined) text.language = cleanLine(patch.language, 40);
  guardContact(text);
  Object.assign(g, text);
  if (patch.audience) g.audience = patch.audience;
  if (patch.maxMembers !== undefined) {
    if (patch.maxMembers < g.members.length) throw ApiError.badRequest(`The group already has ${g.members.length} people.`);
    g.maxMembers = patch.maxMembers;
  }
  if (patch.nextSessionAt !== undefined) g.nextSessionAt = patch.nextSessionAt ? new Date(patch.nextSessionAt) : undefined;
  if (patch.status) g.status = patch.status;
  await g.save();
  if (text.title) await ConnectConversation.updateOne({ _id: g.conversationId }, { $set: { name: g.title.slice(0, 60) } });
  const mine = await CommunityProfile.findOne({ userId: oid(me) }).lean();
  return { group: groupDto(g.toObject(), { me, ownerProfile: mine, pending: new Set(), friends: new Set() }) };
}

export async function requestJoin(me, groupId, message) {
  needId(groupId, 'Group');
  const clean = cleanLine(message || '', 200);
  guardContact({ m: clean });
  const g = await StudyGroup.findOne({ _id: groupId, status: 'open' }).lean();
  if (!g) throw ApiError.notFound('Group not found.');
  if (g.members.some((m) => String(m) === String(me))) throw ApiError.conflict('You are already in this group.');
  const [friends, blocked, alive] = await Promise.all([friendSet(me), isBlockedEither(me, g.ownerId), activeUsers([g.ownerId])]);
  if (!alive.has(String(g.ownerId)) || !canView({ audience: g.audience, isFriend: friends.has(String(g.ownerId)), blocked })) throw ApiError.notFound('Group not found.');
  if (g.members.length >= g.maxMembers) throw ApiError.badRequest('This group is full.');
  await assertDailyRequests(me);
  let r;
  try {
    r = await CommunityRequest.create({ kind: 'group', fromId: oid(me), toId: g.ownerId, groupId: g._id, message: clean });
  } catch (err) {
    if (err?.code === 11000) throw ApiError.conflict('You already asked to join this group.');
    throw err;
  }
  const mine = await CommunityProfile.findOne({ userId: oid(me) }).lean();
  notify(g.ownerId, { type: 'community_request', title: `${nameOf(mine)} asked to join "${g.title}"`.slice(0, 120), body: clean, link: '/community?tab=requests' });
  return { requestId: String(r._id), status: 'pending' };
}

async function pullMember(g, userId) {
  await StudyGroup.updateOne({ _id: g._id }, { $pull: { members: oid(userId) } });
  await ConnectConversation.updateOne({ _id: g.conversationId }, { $pull: { members: oid(userId), reads: { userId: oid(userId) }, admins: oid(userId) } });
  const convo = await ConnectConversation.findById(g.conversationId).select('members').lean();
  changed(g.conversationId, [...(convo?.members || []).map(String), String(userId)]);
}

export async function leaveGroup(me, id) {
  needId(id, 'Group');
  const g = await StudyGroup.findOne({ _id: id, members: oid(me) }).lean();
  if (!g) throw ApiError.notFound('Group not found.');
  if (String(g.ownerId) === String(me)) throw ApiError.badRequest('You started this group. Close it instead of leaving.');
  const mine = await CommunityProfile.findOne({ userId: oid(me) }).lean();
  await pullMember(g, me);
  const convo = await ConnectConversation.findById(g.conversationId);
  if (convo) await systemMessage(convo, me, `${nameOf(mine)} left the group`);
  return { left: true };
}

export async function removeMember(me, id, userId) {
  const g = await ownGroup(me, id);
  needId(userId, 'That person');
  if (String(userId) === String(me)) throw ApiError.badRequest('You started this group. Close it instead.');
  if (!g.members.some((m) => String(m) === String(userId))) throw ApiError.notFound('That person is not in the group.');
  await pullMember(g, userId);
  const convo = await ConnectConversation.findById(g.conversationId);
  if (convo) await systemMessage(convo, me, 'A member was removed by the organizer');
  return { removed: true };
}

// ───────────────────────── Requests ─────────────────────────

export async function listRequests(me) {
  const [incoming, outgoing] = await Promise.all([
    CommunityRequest.find({ toId: oid(me), status: 'pending' }).sort({ createdAt: -1 }).limit(50).lean(),
    CommunityRequest.find({ fromId: oid(me) }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);
  const people = [...incoming.map((r) => r.fromId), ...outgoing.map((r) => r.toId)];
  const groups = await StudyGroup.find({ _id: { $in: [...incoming, ...outgoing].map((r) => r.groupId).filter(Boolean) } }).select('title').lean();
  const profiles = await CommunityProfile.find({ userId: { $in: people } }).lean();
  const pBy = new Map(profiles.map((p) => [String(p.userId), p]));
  const gBy = new Map(groups.map((g) => [String(g._id), g.title]));
  const shape = (r, otherId) => ({
    id: String(r._id), kind: r.kind, status: r.status, message: r.message, createdAt: r.createdAt,
    otherName: nameOf(pBy.get(String(otherId))), groupTitle: r.groupId ? gBy.get(String(r.groupId)) || 'a group' : null,
  });
  const more = await impact.incomingAndOutgoing(me);
  const morePeople = await CommunityProfile.find({ userId: { $in: [...more.incoming.map((r) => r.fromId), ...more.outgoing.map((r) => r.toId)] } }).lean();
  const mBy = new Map(morePeople.map((p) => [String(p.userId), p]));
  const shapeImpact = (r, otherId) => ({
    id: String(r._id), kind: 'impact', status: r.status, message: r.message, createdAt: r.createdAt,
    otherName: nameOf(mBy.get(String(otherId))), groupTitle: more.titleOf(r),
  });
  const byDate = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
  return {
    incoming: [...incoming.map((r) => shape(r, r.fromId)), ...more.incoming.map((r) => shapeImpact(r, r.fromId))].sort(byDate),
    outgoing: [...outgoing.map((r) => shape(r, r.toId)), ...more.outgoing.map((r) => shapeImpact(r, r.toId))].sort(byDate).slice(0, 50),
  };
}

export async function cancelRequest(me, id) {
  needId(id, 'Request');
  const r = await CommunityRequest.findOneAndUpdate({ _id: id, fromId: oid(me), status: 'pending' }, { $set: { status: 'cancelled', respondedAt: new Date() } });
  if (!r && !(await impact.cancelInterest(me, id))) throw ApiError.notFound('That request is no longer open.');
  return { cancelled: true };
}

export async function respondRequest(me, id, action) {
  needId(id, 'Request');
  const open = await CommunityRequest.findOne({ _id: id, toId: oid(me), status: 'pending' }).lean();
  if (!open) return impact.respondInterest(me, id, action); // not a mentor or group request: maybe an Impact listing
  const mine = await CommunityProfile.findOne({ userId: oid(me) }).lean();
  if (action === 'decline') {
    await CommunityRequest.updateOne({ _id: id, status: 'pending' }, { $set: { status: 'declined', respondedAt: new Date() } });
    return { status: 'declined' };
  }
  if (await isBlockedEither(me, open.fromId)) {
    await CommunityRequest.updateOne({ _id: id, status: 'pending' }, { $set: { status: 'cancelled', respondedAt: new Date() } });
    throw ApiError.notFound('That request is no longer open.');
  }
  // claim first, so two quick taps cannot accept twice
  const r = await CommunityRequest.findOneAndUpdate({ _id: id, toId: oid(me), status: 'pending' }, { $set: { status: 'accepted', respondedAt: new Date() } }, { new: true });
  if (!r) throw ApiError.notFound('That request is no longer open.');

  if (r.kind === 'mentor') {
    await ensureFriends(me, r.fromId);
    const convo = await openConversation(me, r.fromId).catch(() => null);
    notify(r.fromId, { type: 'community_update', title: `${nameOf(mine)} accepted your request`, body: 'You can now chat in Connect.', link: '/connect/chats' });
    return { status: 'accepted', conversationId: convo?.id || null };
  }

  // group join: capacity and status are checked in the same atomic update
  const g = await StudyGroup.findOneAndUpdate(
    { _id: r.groupId, ownerId: oid(me), status: 'open', members: { $ne: r.fromId }, $expr: { $lt: [{ $size: '$members' }, '$maxMembers'] } },
    { $addToSet: { members: r.fromId } },
    { new: true }
  );
  if (!g) {
    await CommunityRequest.updateOne({ _id: id }, { $set: { status: 'pending' }, $unset: { respondedAt: '' } });
    throw ApiError.badRequest('The group is full, closed or this person is already in it.');
  }
  await ConnectConversation.updateOne({ _id: g.conversationId, members: { $ne: r.fromId } }, { $push: { members: r.fromId, reads: { userId: r.fromId } } });
  const convo = await ConnectConversation.findById(g.conversationId);
  if (convo) await systemMessage(convo, me, 'A new member joined the study group');
  changed(g.conversationId, g.members.map(String));
  notify(r.fromId, { type: 'community_update', title: `You joined "${g.title}"`.slice(0, 120), body: 'Open the group chat in Connect.', link: `/connect/chats/${g.conversationId}`, conversationId: g.conversationId });
  return { status: 'accepted', conversationId: String(g.conversationId) };
}

// ───────────────────────── Reporting and moderation ─────────────────────────

export async function report(me, { targetType, userId, groupId, listingId, reason, details }) {
  const since = new Date(Date.now() - DAY);
  if ((await CommunityReport.countDocuments({ reporterId: oid(me), createdAt: { $gte: since } })) >= LIMITS.reportsPerDay) {
    throw new ApiError(429, 'You have sent many reports today. Please try again tomorrow.', { code: 'RATE_LIMITED' });
  }
  let target;
  let snapshot;
  if (targetType === 'group') {
    needId(groupId, 'Group');
    const g = await StudyGroup.findById(groupId).lean();
    if (!g || String(g.ownerId) === String(me)) throw ApiError.notFound('Group not found.');
    target = { targetUserId: g.ownerId, groupId: g._id };
    snapshot = `${g.title} | ${g.topic} | ${g.description}`;
  } else if (targetType === 'listing') {
    needId(listingId, 'Listing');
    const l = await impact.getListingForReport(listingId);
    if (!l || String(l.ownerId) === String(me)) throw ApiError.notFound('Listing not found.');
    target = { targetUserId: l.ownerId, groupId: l._id }; // groupId holds the listing id for listing reports
    snapshot = `${l.category} | ${l.title} | ${l.orgName} | ${l.description}`;
  } else {
    needId(userId, 'That person');
    if (String(userId) === String(me)) throw ApiError.badRequest('Choose someone else to report.');
    const p = await CommunityProfile.findOne({ userId: oid(userId), enabled: true }).lean();
    if (!p) throw ApiError.notFound('That profile was not found.');
    target = { targetUserId: oid(userId) };
    snapshot = `${p.displayName} | offers: ${p.offers.join(', ')} | wants: ${p.wants.join(', ')} | ${p.intro}`;
  }
  const doc = { reporterId: oid(me), targetType, ...target, reason, details: cleanLine(details || '', 500), snapshot: snapshot.slice(0, 600) };
  try {
    await CommunityReport.create(doc);
  } catch (err) {
    if (err?.code !== 11000) throw err; // reporting the same thing twice is fine: it is already on file
  }
  await applyHide(doc);
  return { reported: true };
}

async function applyHide({ targetType, targetUserId, groupId }) {
  const q = { targetType, targetUserId, status: { $ne: 'dismissed' }, ...(groupId ? { groupId } : {}) };
  const n = (await CommunityReport.distinct('reporterId', q)).length;
  if (!shouldHide(n)) return false;
  if (targetType === 'group') await StudyGroup.updateOne({ _id: groupId, status: { $ne: 'hidden' } }, { $set: { status: 'hidden' } });
  else if (targetType === 'listing') await impact.setListingStatus(groupId, 'hidden');
  else await CommunityProfile.updateOne({ userId: targetUserId }, { $set: { hidden: true } });
  return true;
}

export async function adminListReports({ status } = {}) {
  const filter = ['open', 'reviewed', 'dismissed'].includes(status) ? { status } : {};
  const rows = await CommunityReport.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  const users = await User.find({ _id: { $in: rows.flatMap((r) => [r.reporterId, r.targetUserId]) } }).select('name email').lean();
  const uBy = new Map(users.map((u) => [String(u._id), u]));
  return {
    items: rows.map((r) => ({
      id: String(r._id), targetType: r.targetType, reason: r.reason, details: r.details, snapshot: r.snapshot, status: r.status, createdAt: r.createdAt,
      targetUserId: String(r.targetUserId), targetName: uBy.get(String(r.targetUserId))?.name || 'Unknown', reporterName: uBy.get(String(r.reporterId))?.name || 'Unknown',
      groupId: r.groupId ? String(r.groupId) : null,
    })),
  };
}

/** reviewed = keep it hidden if it was hidden; dismissed = if fewer than 3 open reports remain, show it again. */
export async function adminSetReportStatus(id, status) {
  needId(id, 'Report');
  const r = await CommunityReport.findByIdAndUpdate(id, { $set: { status } }, { new: true });
  if (!r) throw ApiError.notFound('Report not found.');
  if (status === 'dismissed') {
    const q = { targetType: r.targetType, targetUserId: r.targetUserId, status: { $ne: 'dismissed' }, ...(r.groupId ? { groupId: r.groupId } : {}) };
    const n = (await CommunityReport.distinct('reporterId', q)).length;
    if (!shouldHide(n)) {
      if (r.targetType === 'group') await StudyGroup.updateOne({ _id: r.groupId, status: 'hidden' }, { $set: { status: 'open' } });
      else if (r.targetType === 'listing') await impact.restoreListing(r.groupId);
      else await CommunityProfile.updateOne({ userId: r.targetUserId }, { $set: { hidden: false } });
    }
  }
  return { id: String(r._id), status: r.status };
}
