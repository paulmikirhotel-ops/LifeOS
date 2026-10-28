import { User } from '../models/index.js';
import { CommunityProfile } from '../models/community.model.js';
import { LearningResource, ResourceReport } from '../models/communityExtras.model.js';
import { ApiError } from '../utils/ApiError.js';
import { blockedWith } from './connectSafety.service.js';
import { oid, DAY, needId, guardContact, nameOf, activeUsers } from './communityShared.js';
import { cleanLine, cleanTags, matchesQuery, mayPublish, assertNoMoneyAsk } from '../utils/community.logic.js';
import { RES, cleanResourceUrl, shouldHideResource } from '../utils/communityExtras.logic.js';

/**
 * Learning resources: a useful link for a skill, shared under the person's Community name.
 * LifeOS does not check or endorse the links. Three different people reporting a resource hides it until an admin looks.
 */
const dto = (r, { me, profile, reported }) => ({
  id: String(r._id), title: r.title, url: r.url, domain: r.domain, skill: r.skill, note: r.note || '', status: r.status,
  ownerName: nameOf(profile), isOwner: String(r.ownerId) === String(me), reported: reported.has(String(r._id)), createdAt: r.createdAt,
});

export async function listResources(me, { q, skill, mine } = {}) {
  const [blocked, myReports] = await Promise.all([blockedWith(me), ResourceReport.find({ reporterId: oid(me) }).select('resourceId').lean()]);
  const blockedSet = new Set(blocked.map(String));
  const reported = new Set(myReports.map((r) => String(r.resourceId)));
  const filter = mine ? { ownerId: oid(me) } : { status: 'open' };
  const rows = await LearningResource.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  const owners = [...new Set(rows.map((r) => String(r.ownerId)))].map(oid);
  const [profiles, alive] = await Promise.all([CommunityProfile.find({ userId: { $in: owners } }).lean(), activeUsers(owners)]);
  const pBy = new Map(profiles.map((p) => [String(p.userId), p]));
  const wanted = skill ? cleanTags([skill])[0] : '';
  const items = rows
    .filter((r) => mine || (alive.has(String(r.ownerId)) && !blockedSet.has(String(r.ownerId)) && pBy.get(String(r.ownerId))?.enabled && !pBy.get(String(r.ownerId))?.hidden))
    .filter((r) => !wanted || r.skill === wanted)
    .filter((r) => matchesQuery([r.title, r.skill, r.note, r.domain], q))
    .slice(0, 50)
    .map((r) => dto(r, { me, profile: pBy.get(String(r.ownerId)), reported }));
  return { items };
}

export async function shareResource(me, body, now = new Date()) {
  const [profile, user] = await Promise.all([CommunityProfile.findOne({ userId: oid(me) }).lean(), User.findById(me).select('createdAt').lean()]);
  if (!profile?.enabled || !profile.displayName) throw ApiError.badRequest('Switch on your community profile (with a display name) before you share.');
  const gate = mayPublish(user?.createdAt, now);
  if (!gate.ok) throw new ApiError(403, `New accounts can share after ${gate.readyAt.toISOString().slice(0, 16).replace('T', ' ')} UTC. You can already browse and save resources.`, { code: 'NEW_ACCOUNT' });
  const link = cleanResourceUrl(body.url);
  if (!link.ok) throw ApiError.badRequest(link.reason);
  const f = { title: cleanLine(body.title, RES.title), note: cleanLine(body.note || '', RES.note) };
  const skill = cleanTags([body.skill])[0];
  if (!skill) throw ApiError.badRequest('Add one skill word, for example "excel".');
  guardContact({ ...f, skill });
  try { assertNoMoneyAsk({ ...f, skill }); } catch (e) { throw ApiError.badRequest(e.message); }
  if ((await LearningResource.countDocuments({ ownerId: oid(me), createdAt: { $gte: new Date(now.getTime() - DAY) } })) >= RES.perDay) {
    throw new ApiError(429, `You can share up to ${RES.perDay} resources a day.`, { code: 'RATE_LIMITED' });
  }
  if ((await LearningResource.countDocuments({ ownerId: oid(me) })) >= RES.perUser) {
    throw new ApiError(429, `You can have up to ${RES.perUser} shared resources. Remove one first.`, { code: 'RATE_LIMITED' });
  }
  let r;
  try { r = await LearningResource.create({ ownerId: oid(me), ...f, url: link.url, domain: link.domain, skill }); } catch (e) {
    if (e?.code === 11000) throw ApiError.conflict('You already shared that link.');
    throw e;
  }
  return { resource: dto(r.toObject ? r.toObject() : r, { me, profile, reported: new Set() }) };
}

export async function removeResource(me, id) {
  needId(id, 'Resource');
  const r = await LearningResource.findOneAndDelete({ _id: id, ownerId: oid(me) });
  if (!r) throw ApiError.notFound('Resource not found.');
  return { removed: true };
}

async function applyHide(resourceId) {
  const n = (await ResourceReport.distinct('reporterId', { resourceId, status: { $ne: 'dismissed' } })).length;
  if (!shouldHideResource(n)) return false;
  await LearningResource.updateOne({ _id: resourceId, status: { $ne: 'hidden' } }, { $set: { status: 'hidden' } });
  return true;
}

export async function reportResource(me, id, { reason, details } = {}, now = new Date()) {
  needId(id, 'Resource');
  if ((await ResourceReport.countDocuments({ reporterId: oid(me), createdAt: { $gte: new Date(now.getTime() - DAY) } })) >= RES.reportsPerDay) {
    throw new ApiError(429, 'You have sent many reports today. Please try again tomorrow.', { code: 'RATE_LIMITED' });
  }
  const r = await LearningResource.findById(id).lean();
  if (!r || String(r.ownerId) === String(me)) throw ApiError.notFound('Resource not found.');
  try {
    await ResourceReport.create({ reporterId: oid(me), resourceId: r._id, ownerId: r.ownerId, reason, details: cleanLine(details || '', 500), snapshot: `${r.skill} | ${r.title} | ${r.url} | ${r.note || ''}`.slice(0, 600) });
  } catch (e) { if (e?.code !== 11000) throw e; /* reporting the same thing twice is fine: it is already on file */ }
  await applyHide(r._id);
  return { reported: true };
}

// ───────────────────────── admin ─────────────────────────
export async function adminListResourceReports({ status } = {}) {
  const filter = ['open', 'reviewed', 'dismissed'].includes(status) ? { status } : {};
  const rows = await ResourceReport.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  const people = await User.find({ _id: { $in: rows.flatMap((r) => [r.reporterId, r.ownerId]) } }).select('name email').lean();
  const uBy = new Map(people.map((u) => [String(u._id), u]));
  const live = await LearningResource.find({ _id: { $in: rows.map((r) => r.resourceId) } }).select('status').lean();
  const sBy = new Map(live.map((l) => [String(l._id), l.status]));
  return {
    items: rows.map((r) => ({
      id: String(r._id), resourceId: String(r.resourceId), reason: r.reason, details: r.details, snapshot: r.snapshot, status: r.status, createdAt: r.createdAt,
      ownerName: uBy.get(String(r.ownerId))?.name || 'Unknown', reporterName: uBy.get(String(r.reporterId))?.name || 'Unknown',
      resourceStatus: sBy.get(String(r.resourceId)) || 'removed',
    })),
  };
}
/** reviewed = keep it hidden if it was hidden; dismissed = if fewer than 3 open reports remain, show it again. */
export async function adminSetResourceReportStatus(id, status) {
  needId(id, 'Report');
  const r = await ResourceReport.findByIdAndUpdate(id, { $set: { status } }, { new: true });
  if (!r) throw ApiError.notFound('Report not found.');
  if (status === 'dismissed') {
    const n = (await ResourceReport.distinct('reporterId', { resourceId: r.resourceId, status: { $ne: 'dismissed' } })).length;
    if (!shouldHideResource(n)) await LearningResource.updateOne({ _id: r.resourceId, status: 'hidden' }, { $set: { status: 'open' } });
  }
  return { id: String(r._id), status: r.status };
}
export async function adminRemoveResource(id) {
  needId(id, 'Resource');
  const r = await LearningResource.findByIdAndDelete(id);
  if (!r) throw ApiError.notFound('Resource not found.');
  await ResourceReport.updateMany({ resourceId: r._id, status: 'open' }, { $set: { status: 'reviewed' } });
  return { removed: true };
}
