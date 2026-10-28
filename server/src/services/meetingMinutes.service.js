import { ActionItem, Meeting, MeetingParticipant, User } from '../models/index.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { sendMail } from '../utils/mailer.js';
import { buildMinutesEmail, cleanEmail, dedupeRecipients, signMinutesKey, verifyMinutesKey } from '../utils/minutesAccess.js';
import { authorizePass } from './meetingInvite.service.js';

/**
 * Minutes for people who joined by link.
 *
 * Ownership: the recording, transcript, summary and minutes all live on the organizer's Meeting, no matter
 * who pressed "record". Link joiners only ever get a READ-ONLY view (summary, minutes, action items) — never audio
 * or the transcript — and the organizer can switch it off per meeting.
 */

async function payloadFor(meeting) {
  if (meeting.minutesSharing?.enabled === false) {
    throw new ApiError(403, 'The organizer has not shared the minutes of this meeting.', { code: 'MINUTES_OFF' });
  }
  const hasContent = Boolean(meeting.summary?.executiveSummary || meeting.minutes?.content);
  const base = {
    title: meeting.title,
    startAt: meeting.startedAt || meeting.startAt,
    endAt: meeting.endedAt || meeting.endAt,
    timezone: meeting.timezone,
  };
  const org = await User.findById(meeting.organizerId).select('name').lean();
  base.organizerName = org?.name || 'LifeOS user';
  if (meeting.status !== 'completed' || !hasContent) {
    const pending = meeting.status === 'completed' && ['pending', 'processing'].includes(meeting.processing?.summary);
    return {
      ...base,
      ready: false,
      message: pending
        ? 'The minutes are being prepared. Check back in a few minutes.'
        : meeting.status === 'completed'
          ? 'No minutes are available for this meeting.'
          : 'The minutes will be available after the meeting has ended and been processed.',
    };
  }
  const items = await ActionItem.find({ meetingId: meeting._id }).sort({ createdAt: 1 }).limit(200)
    .select('task assigneeName deadline deadlineText priority status').lean();
  return {
    ...base,
    ready: true,
    summary: meeting.summary || null,
    minutes: meeting.minutes?.content || null,
    actionItems: items,
  };
}

/** Still holding a meeting pass (same browser after joining). */
export async function getMinutesViaPass(token, pass) {
  const { meeting } = await authorizePass(token, pass);
  return payloadFor(meeting);
}

/** The personal key from the minutes e-mail. */
export async function getMinutesViaKey(key) {
  const parsed = verifyMinutesKey(key);
  if (!parsed || !/^[a-f0-9]{24}$/i.test(parsed.meetingId)) throw ApiError.notFound('This minutes link is not valid.');
  const meeting = await Meeting.findById(parsed.meetingId);
  if (!meeting) throw ApiError.notFound('This minutes link is not valid.');
  return payloadFor(meeting);
}

export function minutesUrl(meetingId, who) {
  return `${env.clientUrls[0]}/minutes/${signMinutesKey(meetingId, who)}`;
}

async function collectRecipients(meeting, extraEmails = []) {
  const [rows, organizer] = await Promise.all([
    MeetingParticipant.find({ meetingId: meeting._id, role: { $ne: 'chair' } }).select('email userId displayName').limit(300).lean(),
    User.findById(meeting.organizerId).select('name email').lean(),
  ]);
  const ids = new Set();
  rows.forEach((r) => r.userId && ids.add(String(r.userId)));
  meeting.participants.forEach((p) => p.userId && ids.add(String(p.userId)));
  const users = ids.size ? await User.find({ _id: { $in: [...ids] } }).select('name email').lean() : [];
  const emailOfUser = new Map(users.map((u) => [String(u._id), u]));
  const candidates = [
    ...rows.map((r) => ({ email: r.email || emailOfUser.get(String(r.userId))?.email, name: r.displayName })),
    ...meeting.participants.map((p) => ({ email: p.email || emailOfUser.get(String(p.userId))?.email, name: p.name })),
    ...extraEmails.map((e) => ({ email: e })),
  ];
  return { recipients: dedupeRecipients(candidates, [organizer?.email]), organizer };
}

async function deliver(meeting, organizer, recipients) {
  let sent = 0;
  for (const r of recipients) {
    const mail = buildMinutesEmail({
      title: meeting.title,
      organizerName: organizer?.name,
      startAt: meeting.startedAt || meeting.startAt,
      name: r.name,
      url: minutesUrl(meeting._id, r.email),
    });
    const res = await sendMail({ to: r.email, ...mail });
    if (res.sent || res.devLogged) sent += 1;
  }
  return sent;
}

/** Organizer pressed "Send minutes now": e-mails everyone who joined again, plus optional extra addresses. */
export async function sendMinutesNow(meeting, rawEmails = []) {
  if (meeting.status !== 'completed') throw new ApiError(409, 'The meeting must be finished first.', { code: 'NOT_COMPLETED' });
  if (meeting.minutesSharing?.enabled === false) throw new ApiError(403, 'Minutes sharing is switched off for this meeting.', { code: 'MINUTES_OFF' });
  if (!(meeting.summary?.executiveSummary || meeting.minutes?.content)) {
    throw new ApiError(409, 'The minutes are not ready yet.', { code: 'MINUTES_NOT_READY' });
  }
  const extra = [...new Set((Array.isArray(rawEmails) ? rawEmails : []).map((e) => cleanEmail(e)).filter(Boolean))].slice(0, 20);
  const now = new Date();
  const claim = await Meeting.updateOne(
    { _id: meeting._id, $or: [{ 'minutesSharing.lastManualAt': { $exists: false } }, { 'minutesSharing.lastManualAt': { $lt: new Date(now - 60000) } }] },
    { $set: { 'minutesSharing.lastManualAt': now } }
  );
  if (!claim.modifiedCount) throw new ApiError(429, 'Minutes were just sent. Please wait a minute.', { code: 'TOO_SOON' });
  const { recipients, organizer } = await collectRecipients(meeting, extra);
  const sent = await deliver(meeting, organizer, recipients);
  return { sent, recipients: recipients.length };
}

/**
 * E-mails the minutes link to everybody who gave an address or has an account. Runs once per meeting (atomic claim),
 * never throws: a mail problem must not break the pipeline.
 */
export async function sendMinutesToParticipants(meetingId) {
  try {
    const claimed = await Meeting.updateOne(
      { _id: meetingId, 'minutesSharing.sentAt': { $exists: false }, 'minutesSharing.enabled': { $ne: false } },
      { $set: { 'minutesSharing.sentAt': new Date() } }
    );
    if (!claimed.modifiedCount) return { sent: 0 };
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) return { sent: 0 };

    const { recipients, organizer } = await collectRecipients(meeting);
    return { sent: await deliver(meeting, organizer, recipients) };
  } catch (err) {
    console.error(`[minutes] could not e-mail participants: ${err.message}`);
    return { sent: 0 };
  }
}

export { cleanEmail };
