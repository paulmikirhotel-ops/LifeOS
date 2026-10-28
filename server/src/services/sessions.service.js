import * as appModels from '../models/index.js';
import { CommunityProfile, CommunityRequest } from '../models/community.model.js';
import { MentorSession } from '../models/communityExtras.model.js';
import { ApiError } from '../utils/ApiError.js';
import { isBlockedEither, blockedWith } from './connectSafety.service.js';
import { notify } from './connectNotify.service.js';
import { oid, DAY, needId, guardContact, nameOf, activeUsers } from './communityShared.js';
import { cleanLine } from '../utils/community.logic.js';
import { SESSION, validateSlot, stateOf, reminderDue } from '../utils/communityExtras.logic.js';

/**
 * Scheduled sessions between two people who already have an accepted mentor request.
 * Times are stored once in UTC and shown in each person's own time zone by the app.
 * Nothing is added to anyone's calendar unless that person asks.
 */
const say = (userId, payload) => { try { Promise.resolve(notify(userId, payload)).catch(() => {}); } catch { /* notifications are optional */ } };
const sessionsLink = '/community?tab=sessions';
const mine = (me) => [{ proposerId: oid(me) }, { otherId: oid(me) }];
const otherOf = (s, me) => (String(s.proposerId) === String(me) ? s.otherId : s.proposerId);

async function areMentorPartners(a, b) {
  return Boolean(await CommunityRequest.findOne({
    kind: 'mentor', status: 'accepted', $or: [{ fromId: oid(a), toId: oid(b) }, { fromId: oid(b), toId: oid(a) }],
  }).lean());
}

/** People this person can plan a session with: accepted mentor requests, either direction, nobody blocked. */
export async function partners(me) {
  const [rows, blocked] = await Promise.all([
    CommunityRequest.find({ kind: 'mentor', status: 'accepted', $or: [{ fromId: oid(me) }, { toId: oid(me) }] }).limit(200).lean(),
    blockedWith(me),
  ]);
  const blockedSet = new Set(blocked.map(String));
  const byUser = new Map();
  for (const r of rows) {
    const other = String(r.fromId) === String(me) ? r.toId : r.fromId;
    if (blockedSet.has(String(other)) || byUser.has(String(other))) continue;
    byUser.set(String(other), { userId: String(other), role: String(r.toId) === String(me) ? 'learner' : 'mentor' }); // role of the OTHER person
  }
  const ids = [...byUser.keys()].map(oid);
  const [profiles, alive] = await Promise.all([CommunityProfile.find({ userId: { $in: ids } }).lean(), activeUsers(ids)]);
  const pBy = new Map(profiles.map((p) => [String(p.userId), p]));
  return { items: [...byUser.values()].filter((p) => alive.has(p.userId)).map((p) => ({ ...p, name: nameOf(pBy.get(p.userId)) })) };
}

/** Blocking someone cancels the upcoming sessions between you. Checked whenever sessions are read, so no other file needs to change. */
async function dropBlocked(me, now) {
  const blocked = await blockedWith(me);
  if (!blocked.length) return;
  const ids = blocked.map(oid);
  await MentorSession.updateMany(
    { status: { $in: ['proposed', 'accepted'] }, startsAt: { $gt: now }, $or: [{ proposerId: oid(me), otherId: { $in: ids } }, { otherId: oid(me), proposerId: { $in: ids } }] },
    { $set: { status: 'cancelled', respondedAt: now } }
  );
}

export async function listSessions(me, now = new Date()) {
  await dropBlocked(me, now);
  const rows = await MentorSession.find({ $or: mine(me), startsAt: { $gte: new Date(now.getTime() - 30 * DAY) } }).sort({ startsAt: 1 }).limit(200).lean();
  const people = [...new Set(rows.map((s) => String(otherOf(s, me))))].map(oid);
  const profiles = await CommunityProfile.find({ userId: { $in: people } }).lean();
  const pBy = new Map(profiles.map((p) => [String(p.userId), p]));
  const shape = (s) => ({
    id: String(s._id), withId: String(otherOf(s, me)), withName: nameOf(pBy.get(String(otherOf(s, me)))), startsAt: s.startsAt, endsAt: s.endsAt, minutes: s.minutes, note: s.note || '',
    state: stateOf(s, me, now), proposedByMe: String(s.proposerId) === String(me), inMyCalendar: (s.calendar || []).some((c) => String(c.userId) === String(me)),
  });
  const all = rows.map(shape);
  return {
    upcoming: all.filter((s) => s.state === 'accepted'),
    waitingForYou: all.filter((s) => s.state === 'waiting_you'),
    waitingForThem: all.filter((s) => s.state === 'waiting_them'),
    recent: all.filter((s) => ['done', 'declined', 'cancelled', 'countered', 'expired'].includes(s.state)).sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt)).slice(0, 15),
  };
}

async function assertFree(userIds, startsAt, endsAt, ignoreId) {
  const clash = await MentorSession.findOne({
    status: 'accepted', startsAt: { $lt: endsAt }, endsAt: { $gt: startsAt },
    ...(ignoreId ? { _id: { $ne: oid(ignoreId) } } : {}),
    $or: userIds.flatMap((u) => [{ proposerId: oid(u) }, { otherId: oid(u) }]),
  }).lean();
  return clash;
}

export async function propose(me, { userId, startsAt, minutes, note }, now = new Date()) {
  needId(userId, 'That person');
  if (String(me) === String(userId)) throw ApiError.badRequest('Choose someone else.');
  if (!(await areMentorPartners(me, userId))) throw ApiError.badRequest('You can plan a session after a mentor request between you was accepted.');
  if (await isBlockedEither(me, userId)) throw ApiError.notFound('That person is not available.');
  if (!(await activeUsers([oid(userId)])).has(String(userId))) throw ApiError.notFound('That person is not available.');
  const slot = validateSlot(startsAt, minutes, now);
  if (!slot.ok) throw ApiError.badRequest(slot.reason);
  const clean = cleanLine(note || '', SESSION.note);
  guardContact({ note: clean });
  if ((await MentorSession.countDocuments({ proposerId: oid(me), createdAt: { $gte: new Date(now.getTime() - DAY) } })) >= SESSION.proposalsPerDay) {
    throw new ApiError(429, `You can propose up to ${SESSION.proposalsPerDay} sessions a day.`, { code: 'RATE_LIMITED' });
  }
  if ((await MentorSession.countDocuments({ proposerId: oid(me), status: 'proposed', startsAt: { $gt: now } })) >= SESSION.waitingPerPerson) {
    throw new ApiError(429, `You have ${SESSION.waitingPerPerson} proposals waiting. Wait for answers or cancel some.`, { code: 'RATE_LIMITED' });
  }
  if (await MentorSession.findOne({ proposerId: oid(me), otherId: oid(userId), startsAt: new Date(startsAt), status: 'proposed' }).lean()) throw ApiError.conflict('You already proposed that time.');
  if (await assertFree([me], new Date(startsAt), slot.endsAt)) throw ApiError.conflict('You already have a session at that time.');
  const s = await MentorSession.create({ proposerId: oid(me), otherId: oid(userId), startsAt: new Date(startsAt), endsAt: slot.endsAt, minutes, note: clean, status: 'proposed' });
  const p = await CommunityProfile.findOne({ userId: oid(me) }).lean();
  say(userId, { type: 'community_request', title: `${nameOf(p)} proposed a session time`.slice(0, 120), body: clean, link: sessionsLink });
  return { id: String(s._id), status: 'proposed' };
}

export async function respond(me, id, action, now = new Date()) {
  needId(id, 'Session');
  const s = await MentorSession.findOne({ _id: id, otherId: oid(me), status: 'proposed', startsAt: { $gt: now } }).lean();
  if (!s) throw ApiError.notFound('That proposal is no longer open.');
  const p = await CommunityProfile.findOne({ userId: oid(me) }).lean();
  if (action === 'decline') {
    await MentorSession.updateOne({ _id: id, status: 'proposed' }, { $set: { status: 'declined', respondedAt: now } });
    say(s.proposerId, { type: 'community_update', title: `${nameOf(p)} cannot make that time`.slice(0, 120), body: 'You can propose another time.', link: sessionsLink });
    return { status: 'declined' };
  }
  if (await isBlockedEither(me, s.proposerId)) {
    await MentorSession.updateOne({ _id: id, status: 'proposed' }, { $set: { status: 'cancelled', respondedAt: now } });
    throw ApiError.notFound('That proposal is no longer open.');
  }
  if (await assertFree([me, s.proposerId], s.startsAt, s.endsAt, id)) throw ApiError.conflict('One of you already has a session at that time. Suggest another time instead.');
  // claim first, so two quick taps cannot accept twice
  const r = await MentorSession.findOneAndUpdate({ _id: id, otherId: oid(me), status: 'proposed' }, { $set: { status: 'accepted', respondedAt: now } }, { new: true });
  if (!r) throw ApiError.notFound('That proposal is no longer open.');
  say(s.proposerId, { type: 'community_update', title: `${nameOf(p)} accepted your session time`.slice(0, 120), body: 'It is on your Sessions list.', link: sessionsLink });
  return { status: 'accepted' };
}

/** "Suggest another time": the original proposal is closed and a new one goes back to the other person. */
export async function counter(me, id, { startsAt, minutes, note }, now = new Date()) {
  needId(id, 'Session');
  const s = await MentorSession.findOne({ _id: id, otherId: oid(me), status: 'proposed', startsAt: { $gt: now } }).lean();
  if (!s) throw ApiError.notFound('That proposal is no longer open.');
  if (await isBlockedEither(me, s.proposerId)) throw ApiError.notFound('That proposal is no longer open.');
  const slot = validateSlot(startsAt, minutes, now);
  if (!slot.ok) throw ApiError.badRequest(slot.reason);
  const clean = cleanLine(note || '', SESSION.note);
  guardContact({ note: clean });
  if (await assertFree([me], new Date(startsAt), slot.endsAt)) throw ApiError.conflict('You already have a session at that time.');
  const claimed = await MentorSession.findOneAndUpdate({ _id: id, otherId: oid(me), status: 'proposed' }, { $set: { status: 'countered', respondedAt: now } }, { new: true });
  if (!claimed) throw ApiError.notFound('That proposal is no longer open.');
  const n = await MentorSession.create({ proposerId: oid(me), otherId: s.proposerId, startsAt: new Date(startsAt), endsAt: slot.endsAt, minutes, note: clean, status: 'proposed', counterOf: s._id });
  const p = await CommunityProfile.findOne({ userId: oid(me) }).lean();
  say(s.proposerId, { type: 'community_request', title: `${nameOf(p)} suggested another time`.slice(0, 120), body: clean, link: sessionsLink });
  return { id: String(n._id), status: 'proposed' };
}

export async function cancel(me, id, now = new Date()) {
  needId(id, 'Session');
  const s = await MentorSession.findOneAndUpdate(
    { _id: id, $or: mine(me), status: { $in: ['proposed', 'accepted'] }, startsAt: { $gt: now } },
    { $set: { status: 'cancelled', respondedAt: now } },
    { new: true }
  );
  if (!s) throw ApiError.notFound('That session can no longer be cancelled.');
  const p = await CommunityProfile.findOne({ userId: oid(me) }).lean();
  say(otherOf(s, me), { type: 'community_update', title: `${nameOf(p)} cancelled the session`.slice(0, 120), body: '', link: sessionsLink });
  return { status: 'cancelled' };
}

/** Adds the session to the person's own LifeOS calendar, once, and only when they ask. */
export async function addToCalendar(u, id, now = new Date()) {
  needId(id, 'Session');
  const { CalendarEvent } = appModels;
  if (!CalendarEvent) throw ApiError.notFound('The calendar is not available.');
  if (!u.tenantId) throw ApiError.badRequest('Choose a workspace first.');
  const s = await MentorSession.findOne({ _id: id, $or: mine(u.id), status: 'accepted' }).lean();
  if (!s || new Date(s.endsAt) <= now) throw ApiError.notFound('That session is not coming up.');
  if ((s.calendar || []).some((c) => String(c.userId) === String(u.id))) throw ApiError.conflict('It is already in your calendar.');
  const other = await CommunityProfile.findOne({ userId: oid(otherOf(s, u.id)) }).lean();
  const ev = await CalendarEvent.create({
    tenantId: u.tenantId, userId: u.id, title: `Mentoring session with ${nameOf(other)}`, type: 'study', description: s.note || '', allDay: false, startAt: s.startsAt, endAt: s.endsAt,
  });
  await MentorSession.updateOne({ _id: s._id }, { $push: { calendar: { userId: oid(u.id), eventId: ev._id } } });
  return { added: true };
}

/** Sends the "starting soon" note once per session. Safe to run from several places: the claim is atomic. */
export async function sendReminders(now = new Date()) {
  const soon = new Date(now.getTime() + SESSION.remindMinutes * 60000);
  const due = await MentorSession.find({ status: 'accepted', reminderSent: false, startsAt: { $gt: now, $lte: soon } }).limit(200).lean();
  let sent = 0;
  for (const s of due) {
    if (!reminderDue(s, now)) continue;
    const claimed = await MentorSession.findOneAndUpdate({ _id: s._id, reminderSent: false, status: 'accepted' }, { $set: { reminderSent: true } }, { new: true });
    if (!claimed) continue;
    if (await isBlockedEither(s.proposerId, s.otherId)) continue;
    const mins = Math.max(1, Math.round((new Date(s.startsAt) - now) / 60000));
    for (const [to, other] of [[s.proposerId, s.otherId], [s.otherId, s.proposerId]]) {
      const p = await CommunityProfile.findOne({ userId: oid(other) }).lean();
      say(to, { type: 'community_update', title: `Your session with ${nameOf(p)} starts in about ${mins} minutes`.slice(0, 120), body: 'Open the chat in Connect to meet.', link: '/connect/chats' });
    }
    sent += 1;
  }
  return { sent };
}

let timer = null;
/** Checks once a minute while the server is awake. Does nothing in tests. */
export function startReminderLoop() {
  if (timer || process.env.NODE_ENV === 'test') return;
  timer = setInterval(() => { sendReminders().catch(() => {}); }, 60000);
  timer.unref?.();
}
