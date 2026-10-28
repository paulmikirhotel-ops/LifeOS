import { User } from '../models/index.js';
import { CommunityProfile } from '../models/community.model.js';
import { ImpactListing, ImpactInterest, VolunteerLog } from '../models/impact.model.js';
import { ApiError } from '../utils/ApiError.js';
import { isBlockedEither, blockedWith } from './connectSafety.service.js';
import { notify } from './connectNotify.service.js';
import { openConversation } from './connect.service.js';
import { oid, DAY, needId, guardContact, nameOf, friendSet, activeUsers, ensureFriends } from './communityShared.js';
import { LIMITS, cleanLine, cleanTags, canView, matchesQuery, mayPublish, assertNoMoneyAsk } from '../utils/community.logic.js';

/**
 * Impact Network: volunteering, tutoring, digital-skills training and community projects.
 * Same rules as Skill Exchange: opt-in, visibility by audience, no contact details, no money asks, agree before contact, report and block.
 * LifeOS does not verify posters. A "reviewed" badge appears only when a platform admin sets it.
 */
const guardMoney = (fields) => {
  try {
    assertNoMoneyAsk(fields);
  } catch (e) {
    throw ApiError.badRequest(e.message);
  }
};

const listingDto = (l, { me, ownerProfile, interested, friends }) => ({
  id: String(l._id), category: l.category, title: l.title, description: l.description, skills: l.skills, location: l.location, mode: l.mode,
  spots: l.spots, spotsLeft: Math.max(0, l.spots - l.accepted.length), startsAt: l.startsAt || null, orgName: l.orgName, verified: Boolean(l.verified),
  audience: l.audience, status: l.status, ownerName: nameOf(ownerProfile), isOwner: String(l.ownerId) === String(me),
  isAccepted: l.accepted.some((a) => String(a) === String(me)), requested: interested.has(String(l._id)), ownerIsFriend: friends.has(String(l.ownerId)),
});

export async function listListings(me, { q, category, mine } = {}) {
  const [friends, blocked, mineInterests] = await Promise.all([
    friendSet(me),
    blockedWith(me),
    ImpactInterest.find({ fromId: oid(me), status: 'pending' }).select('listingId').lean(),
  ]);
  const blockedSet = new Set(blocked);
  const interested = new Set(mineInterests.map((r) => String(r.listingId)));
  const filter = mine ? { ownerId: oid(me) } : { status: 'open' };
  if (category && ['volunteering', 'tutoring', 'digital_skills', 'project'].includes(category)) filter.category = category;
  const rows = await ImpactListing.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  const owners = await CommunityProfile.find({ userId: { $in: rows.map((l) => l.ownerId) } }).lean();
  const ownerBy = new Map(owners.map((o) => [String(o.userId), o]));
  const alive = await activeUsers(rows.map((l) => l.ownerId));
  const items = rows
    .filter((l) => mine || (alive.has(String(l.ownerId)) && canView({ audience: l.audience, isFriend: friends.has(String(l.ownerId)), blocked: blockedSet.has(String(l.ownerId)) })))
    .filter((l) => matchesQuery([l.title, l.description, l.skills, l.location, l.orgName], q))
    .slice(0, 40)
    .map((l) => listingDto(l, { me, ownerProfile: ownerBy.get(String(l.ownerId)), interested, friends }));
  return { items };
}

export async function createListing(me, body) {
  const [mine, user] = await Promise.all([CommunityProfile.findOne({ userId: oid(me) }).lean(), User.findById(me).select('createdAt').lean()]);
  if (!mine?.enabled || !mine.displayName) throw ApiError.badRequest('Switch on your community profile (with a display name) before you post.');
  const gate = mayPublish(user?.createdAt);
  if (!gate.ok) throw new ApiError(403, `New accounts can post after ${gate.readyAt.toISOString().slice(0, 16).replace('T', ' ')} UTC. You can already show interest in listings.`, { code: 'NEW_ACCOUNT' });
  const f = {
    title: cleanLine(body.title, 100), description: cleanLine(body.description, 500), location: cleanLine(body.location || '', 80), orgName: cleanLine(body.orgName || '', 80),
  };
  const skills = cleanTags(body.skills || []);
  guardContact({ ...f, skills });
  guardMoney({ ...f, skills });
  if ((await ImpactListing.countDocuments({ ownerId: oid(me), createdAt: { $gte: new Date(Date.now() - DAY) } })) >= LIMITS.listingsPerDay) {
    throw new ApiError(429, `You can post up to ${LIMITS.listingsPerDay} listings a day.`, { code: 'RATE_LIMITED' });
  }
  if ((await ImpactListing.countDocuments({ ownerId: oid(me), status: { $in: ['open', 'hidden'] } })) >= LIMITS.openListings) {
    throw new ApiError(429, `You can have up to ${LIMITS.openListings} open listings. Close one first.`, { code: 'RATE_LIMITED' });
  }
  const l = await ImpactListing.create({
    ownerId: oid(me), category: body.category, ...f, skills, mode: body.mode || 'online', spots: body.spots || 5,
    startsAt: body.startsAt ? new Date(body.startsAt) : undefined, audience: body.audience || 'friends',
  });
  return { listing: listingDto(l.toObject(), { me, ownerProfile: mine, interested: new Set(), friends: new Set() }) };
}

export async function updateListing(me, id, patch) {
  needId(id, 'Listing');
  const l = await ImpactListing.findOne({ _id: id, ownerId: oid(me) });
  if (!l) throw ApiError.notFound('Listing not found.');
  if (l.status === 'hidden') throw ApiError.forbidden('This listing is hidden pending review.');
  const text = {};
  for (const [k, n] of [['title', 100], ['description', 500], ['location', 80], ['orgName', 80]]) if (patch[k] !== undefined) text[k] = cleanLine(patch[k], n);
  const skills = patch.skills !== undefined ? cleanTags(patch.skills) : undefined;
  guardContact({ ...text, skills: skills || [] });
  guardMoney({ ...text, skills: skills || [] });
  Object.assign(l, text);
  if (skills) l.skills = skills;
  if (patch.category) l.category = patch.category;
  if (patch.mode) l.mode = patch.mode;
  if (patch.audience) l.audience = patch.audience;
  if (patch.spots !== undefined) {
    if (patch.spots < l.accepted.length) throw ApiError.badRequest(`${l.accepted.length} people are already accepted.`);
    l.spots = patch.spots;
  }
  if (patch.startsAt !== undefined) l.startsAt = patch.startsAt ? new Date(patch.startsAt) : undefined;
  if (patch.status) l.status = patch.status;
  await l.save();
  const mine = await CommunityProfile.findOne({ userId: oid(me) }).lean();
  return { listing: listingDto(l.toObject(), { me, ownerProfile: mine, interested: new Set(), friends: new Set() }) };
}

// ───────────────────────── Interest (agree before contact) ─────────────────────────

export async function expressInterest(me, id, message) {
  needId(id, 'Listing');
  const clean = cleanLine(message || '', 200);
  guardContact({ m: clean });
  const l = await ImpactListing.findOne({ _id: id, status: 'open' }).lean();
  if (!l) throw ApiError.notFound('Listing not found.');
  if (String(l.ownerId) === String(me)) throw ApiError.badRequest('This is your own listing.');
  const [friends, blocked, alive] = await Promise.all([friendSet(me), isBlockedEither(me, l.ownerId), activeUsers([l.ownerId])]);
  if (!alive.has(String(l.ownerId)) || !canView({ audience: l.audience, isFriend: friends.has(String(l.ownerId)), blocked })) throw ApiError.notFound('Listing not found.');
  if (l.accepted.some((a) => String(a) === String(me))) throw ApiError.conflict('You are already accepted for this listing.');
  if (l.accepted.length >= l.spots) throw ApiError.badRequest('All spots are taken.');
  if ((await ImpactInterest.countDocuments({ fromId: oid(me), createdAt: { $gte: new Date(Date.now() - DAY) } })) >= LIMITS.interestsPerDay) {
    throw new ApiError(429, `You can send up to ${LIMITS.interestsPerDay} of these a day. Please try again tomorrow.`, { code: 'RATE_LIMITED' });
  }
  let r;
  try {
    r = await ImpactInterest.create({ listingId: l._id, fromId: oid(me), toId: l.ownerId, message: clean });
  } catch (err) {
    if (err?.code === 11000) throw ApiError.conflict('You already showed interest in this listing.');
    throw err;
  }
  const mine = await CommunityProfile.findOne({ userId: oid(me) }).lean();
  notify(l.ownerId, { type: 'community_request', title: `${nameOf(mine)} is interested in "${l.title}"`.slice(0, 120), body: clean, link: '/community?tab=requests' });
  return { requestId: String(r._id), status: 'pending' };
}

export async function incomingAndOutgoing(me) {
  const [incoming, outgoing] = await Promise.all([
    ImpactInterest.find({ toId: oid(me), status: 'pending' }).sort({ createdAt: -1 }).limit(50).lean(),
    ImpactInterest.find({ fromId: oid(me) }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);
  const listings = await ImpactListing.find({ _id: { $in: [...incoming, ...outgoing].map((r) => r.listingId) } }).select('title').lean();
  const tBy = new Map(listings.map((l) => [String(l._id), l.title]));
  return { incoming, outgoing, titleOf: (r) => tBy.get(String(r.listingId)) || 'a listing' };
}

export async function findOpenInterest(me, id) {
  return ImpactInterest.findOne({ _id: id, toId: oid(me), status: 'pending' }).lean();
}

export async function cancelInterest(me, id) {
  const r = await ImpactInterest.findOneAndUpdate({ _id: id, fromId: oid(me), status: 'pending' }, { $set: { status: 'cancelled', respondedAt: new Date() } });
  return Boolean(r);
}

export async function respondInterest(me, id, action) {
  const open = await findOpenInterest(me, id);
  if (!open) throw ApiError.notFound('That request is no longer open.');
  if (action === 'decline') {
    await ImpactInterest.updateOne({ _id: id, status: 'pending' }, { $set: { status: 'declined', respondedAt: new Date() } });
    return { status: 'declined' };
  }
  if (await isBlockedEither(me, open.fromId)) {
    await ImpactInterest.updateOne({ _id: id, status: 'pending' }, { $set: { status: 'cancelled', respondedAt: new Date() } });
    throw ApiError.notFound('That request is no longer open.');
  }
  const r = await ImpactInterest.findOneAndUpdate({ _id: id, toId: oid(me), status: 'pending' }, { $set: { status: 'accepted', respondedAt: new Date() } }, { new: true });
  if (!r) throw ApiError.notFound('That request is no longer open.');
  // spots are checked in the same atomic update that adds the person
  const l = await ImpactListing.findOneAndUpdate(
    { _id: r.listingId, ownerId: oid(me), status: 'open', accepted: { $ne: r.fromId }, $expr: { $lt: [{ $size: '$accepted' }, '$spots'] } },
    { $addToSet: { accepted: r.fromId } },
    { new: true }
  );
  if (!l) {
    await ImpactInterest.updateOne({ _id: id }, { $set: { status: 'pending' }, $unset: { respondedAt: '' } });
    throw ApiError.badRequest('All spots are taken, the listing is closed, or this person is already accepted.');
  }
  await ensureFriends(me, r.fromId);
  const convo = await openConversation(me, r.fromId).catch(() => null);
  const mine = await CommunityProfile.findOne({ userId: oid(me) }).lean();
  notify(r.fromId, { type: 'community_update', title: `${nameOf(mine)} accepted you for "${l.title}"`.slice(0, 120), body: 'You can now chat in Connect.', link: '/connect/chats' });
  return { status: 'accepted', conversationId: convo?.id || null };
}

// ───────────────────────── My volunteering log (private; sharing is per entry) ─────────────────────────

const logDto = (e) => ({ id: String(e._id), title: e.title, hours: e.hours, date: e.date, note: e.note, shared: Boolean(e.shared) });

export async function listLog(me) {
  const rows = await VolunteerLog.find({ userId: oid(me) }).sort({ date: -1, createdAt: -1 }).limit(200).lean();
  const total = rows.reduce((n, r) => n + r.hours, 0);
  const sharedTotal = rows.filter((r) => r.shared).reduce((n, r) => n + r.hours, 0);
  return { items: rows.map(logDto), totalHours: Math.round(total * 100) / 100, sharedHours: Math.round(sharedTotal * 100) / 100 };
}

export async function addLog(me, body) {
  const title = cleanLine(body.title, 100);
  const note = cleanLine(body.note || '', 200);
  guardContact({ title, note });
  const date = new Date(`${body.date}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getTime() > Date.now() + DAY) throw ApiError.badRequest('Pick a date that is not in the future.');
  if ((await VolunteerLog.countDocuments({ userId: oid(me), createdAt: { $gte: new Date(Date.now() - DAY) } })) >= LIMITS.logEntriesPerDay) {
    throw new ApiError(429, 'That is a lot of entries for one day. Please try again tomorrow.', { code: 'RATE_LIMITED' });
  }
  const e = await VolunteerLog.create({ userId: oid(me), title, hours: body.hours, date, note, shared: false }); // sharing is always a separate, explicit choice
  return { entry: logDto(e.toObject()) };
}

export async function updateLog(me, id, patch) {
  needId(id, 'Entry');
  const set = {};
  if (patch.shared !== undefined) set.shared = Boolean(patch.shared);
  if (patch.note !== undefined) {
    set.note = cleanLine(patch.note, 200);
    guardContact({ n: set.note });
  }
  const e = await VolunteerLog.findOneAndUpdate({ _id: id, userId: oid(me) }, { $set: set }, { new: true }).lean();
  if (!e) throw ApiError.notFound('Entry not found.');
  return { entry: logDto(e) };
}

export async function removeLog(me, id) {
  needId(id, 'Entry');
  const r = await VolunteerLog.deleteOne({ _id: id, userId: oid(me) });
  if (!r.deletedCount) throw ApiError.notFound('Entry not found.');
  return { removed: true };
}

/** Hours a person chose to share, for people whose profiles are listed (used on mentor cards). */
export async function sharedHoursFor(userIds) {
  if (!userIds.length) return new Map();
  const rows = await VolunteerLog.aggregate([{ $match: { userId: { $in: userIds.map(oid) }, shared: true } }, { $group: { _id: '$userId', hours: { $sum: '$hours' } } }]);
  return new Map(rows.map((r) => [String(r._id), Math.round(r.hours * 100) / 100]));
}

// ───────────────────────── Admin ─────────────────────────

export async function adminSetVerified(id, verified) {
  needId(id, 'Listing');
  const l = await ImpactListing.findByIdAndUpdate(id, { $set: { verified: Boolean(verified) } }, { new: true }).lean();
  if (!l) throw ApiError.notFound('Listing not found.');
  return { id: String(l._id), verified: l.verified };
}
export async function adminListListings() {
  const rows = await ImpactListing.find({}).sort({ createdAt: -1 }).limit(100).lean();
  return { items: rows.map((l) => ({ id: String(l._id), title: l.title, category: l.category, orgName: l.orgName, status: l.status, verified: l.verified, createdAt: l.createdAt })) };
}

// ───────────────────────── Used by the Community service ─────────────────────────

export const countIncoming = (me) => ImpactInterest.countDocuments({ toId: oid(me), status: 'pending' });
export const getListingForReport = (id) => ImpactListing.findById(id).lean();
export const setListingStatus = (id, status) => ImpactListing.updateOne({ _id: id, status: { $ne: status } }, { $set: { status } });
export const restoreListing = (id) => ImpactListing.updateOne({ _id: id, status: 'hidden' }, { $set: { status: 'open' } });
