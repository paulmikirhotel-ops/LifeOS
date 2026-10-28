import crypto from 'node:crypto';
import { Meeting, MeetingParticipant, Membership, User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { AuditService } from './audit.service.js';
import { loadForManage, claimRecordingFor, releaseRecordingFor, recordingBeatFor, storeChunk } from './meeting.service.js';
import { assertRoomOpen, buildRoomPayload, ensureVideo, markJoined, recordingSnapshot, usesNativeRoom } from './meetingRoom.service.js';
import { cleanEmail } from '../utils/minutesAccess.js';
import * as chat from './meetingChat.service.js';
import { mintMeetingRoomToken } from '../utils/livekit.js';
import {
  INVITE_TOKEN_RE,
  buildInviteFields,
  checkInvitePassword,
  deriveInviteToken,
  generateInvitePassword,
  hashInvitePassword,
  hashInviteToken,
  invitePath,
  signMeetingPass,
  verifyMeetingPass,
} from '../utils/invite.js';

/**
 * Meeting invitation link — organizer controls + the public join flow.
 *
 * Security model (see utils/invite.js for token details):
 *  - A visitor with ONLY the link sees a minimal card (title, organizer, time, status, headcount).
 *  - Agenda, description and the meeting location/URL are released only after the password
 *    (organizer signed in = no password needed) and the access-mode rules pass.
 *  - Wrong passwords are counted per meeting; 8 misses lock the link for 15 minutes (on top of the
 *    per-IP rate limits on the routes), so distributed guessing does not work either.
 *  - Joining creates a MeetingParticipant row only. It never grants workspace access.
 *  - Invalid, disabled and regenerated links all answer generically; nothing is leaked about
 *    private participants.
 */

const MAX_FAILED_ATTEMPTS = 8;
const LOCK_MS = 15 * 60 * 1000;
const ROOM_STALE_MS = 3 * 60 * 1000;

// ── helpers ─────────────────────────────────────────────────────────────

function audit(user, action, meeting, details = {}) {
  AuditService.log({
    tenantId: user.tenantId,
    userId: user.id,
    action,
    resource: 'meeting',
    resourceId: meeting._id,
    details: { title: meeting.title, ...details },
  });
}

/** upcoming | live | ended | cancelled — "ended" also covers a scheduled meeting whose time has passed. */
export function phaseOf(meeting, now = new Date()) {
  if (meeting.status === 'cancelled') return 'cancelled';
  if (meeting.status === 'completed') return 'ended';
  if (meeting.status === 'live') return 'live';
  return meeting.endAt && meeting.endAt < now ? 'ended' : 'upcoming';
}

const PHASE_MESSAGES = {
  ended: 'This meeting has ended.',
  cancelled: 'This meeting has been cancelled.',
};

function settingsOf(meeting, extra = {}) {
  const inv = meeting.invite || {};
  return {
    path: invitePath(meeting._id, inv.version || 1),
    enabled: inv.enabled !== false,
    accessMode: inv.accessMode || 'link',
    hasPassword: true,
    version: inv.version || 1,
    createdAt: inv.createdAt || null,
    regeneratedAt: inv.regeneratedAt || null,
    locked: Boolean(inv.lockedUntil && inv.lockedUntil > new Date()),
    shareMinutes: meeting.minutesSharing?.enabled !== false,
    allowRecording: meeting.recordingPolicy?.anyone !== false,
    ...extra,
  };
}

function cleanName(raw) {
  return Array.from(String(raw || ''))
    .filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127 && ch !== '<' && ch !== '>')
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

async function findByToken(token, { withPassword = false } = {}) {
  if (!INVITE_TOKEN_RE.test(String(token || ''))) throw ApiError.notFound('Meeting not found');
  let q = Meeting.findOne({ 'invite.tokenHash': hashInviteToken(token) });
  if (withPassword) q = q.select('+invite.passwordHash');
  const meeting = await q;
  if (!meeting) throw ApiError.notFound('Meeting not found');
  // Defence in depth: the stored hash matched, but make sure it is still the CURRENT version.
  if (deriveInviteToken(meeting._id, meeting.invite?.version || 1) !== token) throw ApiError.notFound('Meeting not found');
  return meeting;
}

function assertEnabled(meeting) {
  if (meeting.invite?.enabled === false) {
    throw new ApiError(403, 'The organizer has turned this invitation link off.', { code: 'LINK_DISABLED' });
  }
}

/** A signed-in person who already joined with the CURRENT link may come back without the password. */
async function isReturning(meeting, authUser) {
  if (!authUser) return false;
  const row = await MeetingParticipant.findOne({ meetingId: meeting._id, key: `u:${authUser.id}` }).select('inviteVersion').lean();
  return Boolean(row && row.inviteVersion === (meeting.invite?.version || 1));
}

/** Their own workspace is where link-joiner notifications live; prefer the meeting's workspace if they belong to it. */
async function notifyTenantFor(meeting, authUser) {
  const ms = await Membership.find({ userId: authUser.id, status: 'active' }).select('tenantId').sort({ createdAt: 1 }).limit(25).lean();
  if (!ms.length) return undefined;
  return (ms.find((m) => String(m.tenantId) === String(meeting.tenantId)) || ms[0]).tenantId;
}

async function headcount(meeting) {
  const keys = new Set(
    (meeting.participants || []).map((p) => (p.userId ? `u:${p.userId}` : `n:${(p.email || p.name || '').toLowerCase()}`))
  );
  const rows = await MeetingParticipant.find({ meetingId: meeting._id }).select('key').lean();
  rows.forEach((r) => keys.add(r.key));
  return keys.size;
}

async function organizerName(meeting) {
  const org = await User.findById(meeting.organizerId).select('name').lean();
  return org?.name || 'LifeOS user';
}

/** What a verified visitor may see. Never includes notes, transcript, recording, action items or names. */
async function fullDetails(meeting) {
  const [name, count] = await Promise.all([organizerName(meeting), headcount(meeting)]);
  return {
    title: meeting.title,
    description: meeting.description || '',
    agenda: meeting.agenda || '',
    location: meeting.location || '',
    organizerName: name,
    startAt: meeting.startAt,
    endAt: meeting.endAt,
    timezone: meeting.timezone,
    status: meeting.status,
    phase: phaseOf(meeting),
    participantCount: count,
    videoRoom: usesNativeRoom(meeting),
  };
}

// ── organizer: manage the link ──────────────────────────────────────────

/** Older meetings (created before links existed) get a link the first time the organizer asks. */
async function provisionIfMissing(meeting) {
  if (meeting.invite?.createdAt) return null;
  const password = generateInvitePassword();
  const fields = buildInviteFields(meeting._id, { passwordHash: await hashInvitePassword(password) });
  const res = await Meeting.updateOne({ _id: meeting._id, 'invite.createdAt': { $exists: false } }, { $set: { invite: fields } });
  if (res.modifiedCount === 0) return null; // another request provisioned it first
  return password;
}

export async function getInvite(user, id) {
  const meeting = await loadForManage(user, id);
  const password = await provisionIfMissing(meeting);
  const fresh = await Meeting.findById(meeting._id);
  return settingsOf(fresh, password ? { password } : {});
}

export async function updateInvite(user, id, patch) {
  const meeting = await loadForManage(user, id);
  await provisionIfMissing(meeting);

  const set = {};
  if (typeof patch.enabled === 'boolean') set['invite.enabled'] = patch.enabled;
  if (patch.accessMode) set['invite.accessMode'] = patch.accessMode;
  if (typeof patch.shareMinutes === 'boolean') set['minutesSharing.enabled'] = patch.shareMinutes;
  if (typeof patch.allowRecording === 'boolean') set['recordingPolicy.anyone'] = patch.allowRecording;

  let password;
  if (patch.password || patch.regeneratePassword) {
    password = patch.password || generateInvitePassword();
    set['invite.passwordHash'] = await hashInvitePassword(password);
    set['invite.failedAttempts'] = 0;
    set['invite.lockedUntil'] = null;
  }
  if (Object.keys(set).length) await Meeting.updateOne({ _id: meeting._id, tenantId: user.tenantId }, { $set: set });

  audit(user, 'meeting.invite.update', meeting, {
    enabled: patch.enabled,
    accessMode: patch.accessMode,
    shareMinutes: patch.shareMinutes,
    allowRecording: patch.allowRecording,
    passwordChanged: Boolean(password),
  });
  const fresh = await Meeting.findById(meeting._id);
  return settingsOf(fresh, password ? { password } : {});
}

/** New token (old link and every pass issued through it stop working) + a fresh password. */
export async function regenerateInvite(user, id) {
  const meeting = await loadForManage(user, id);
  await provisionIfMissing(meeting);
  const current = await Meeting.findById(meeting._id).select('invite.version');
  const version = (current?.invite?.version || 1) + 1;
  const password = generateInvitePassword();
  await Meeting.updateOne(
    { _id: meeting._id, tenantId: user.tenantId },
    {
      $set: {
        'invite.version': version,
        'invite.tokenHash': hashInviteToken(deriveInviteToken(meeting._id, version)),
        'invite.passwordHash': await hashInvitePassword(password),
        'invite.failedAttempts': 0,
        'invite.lockedUntil': null,
        'invite.regeneratedAt': new Date(),
      },
    }
  );
  audit(user, 'meeting.invite.regenerate', meeting, { version });
  const fresh = await Meeting.findById(meeting._id);
  return settingsOf(fresh, { password });
}

export async function listInviteParticipants(user, id) {
  const meeting = await loadForManage(user, id);
  const rows = await MeetingParticipant.find({ meetingId: meeting._id }).sort({ createdAt: 1 }).limit(500).lean();
  return {
    items: rows.map((r) => {
      // A browser that closed without leaving stops sending heartbeats; show it as left rather than still in the room.
      const vanished = r.status === 'joined' && r.lastSeenAt && Date.now() - new Date(r.lastSeenAt).getTime() > ROOM_STALE_MS;
      return {
      id: String(r._id),
      name: r.displayName,
      isGuest: Boolean(r.isGuest),
      role: r.role,
      joinMethod: r.joinMethod,
      response: r.response,
      status: vanished ? 'left' : r.status,
      joinedAt: r.joinedAt || null,
      leftAt: vanished ? r.lastSeenAt : r.leftAt || null,
      registeredAt: r.createdAt,
      };
    }),
    total: rows.length,
  };
}

// ── public: the invitation page ─────────────────────────────────────────

/** Minimal card shown to anyone holding the link (no password yet). */
export async function getInvitation(token, authUser) {
  const meeting = await findByToken(token);
  assertEnabled(meeting);
  const [name, count] = await Promise.all([organizerName(meeting), headcount(meeting)]);
  const phase = phaseOf(meeting);
  const mode = meeting.invite?.accessMode || 'link';
  const isOrganizer = Boolean(authUser && String(meeting.organizerId) === authUser.id);
  const returning = !isOrganizer && (await isReturning(meeting, authUser));
  return {
    title: meeting.title,
    organizerName: name,
    startAt: meeting.startAt,
    endAt: meeting.endAt,
    timezone: meeting.timezone,
    status: meeting.status,
    phase,
    participantCount: count,
    accessMode: mode,
    canJoin: phase === 'upcoming' || phase === 'live',
    message: PHASE_MESSAGES[phase] || null,
    requiresLogin: mode !== 'link' && !authUser,
    requiresPassword: !isOrganizer && !returning,
    viewer: authUser ? { signedIn: true, name: authUser.name, isOrganizer } : { signedIn: false },
  };
}

async function registerFailure(meeting) {
  // Atomic increment, then read the counter back (plain update + find works on every MongoDB-compatible server).
  await Meeting.updateOne({ _id: meeting._id }, { $inc: { 'invite.failedAttempts': 1 } });
  const upd = await Meeting.findById(meeting._id).select('invite.failedAttempts').lean();
  if ((upd?.invite?.failedAttempts || 0) >= MAX_FAILED_ATTEMPTS) {
    await Meeting.updateOne(
      { _id: meeting._id },
      { $set: { 'invite.failedAttempts': 0, 'invite.lockedUntil': new Date(Date.now() + LOCK_MS) } }
    );
  }
}

async function upsertParticipant(meeting, { authUser, name, isOrganizer, email }) {
  const key = authUser ? `u:${authUser.id}` : `g:${crypto.randomBytes(12).toString('hex')}`;
  const insert = {
    tenantId: meeting.tenantId,
    displayName: authUser ? authUser.name : name,
    isGuest: !authUser,
    role: isOrganizer ? 'chair' : authUser ? 'attendee' : 'guest',
    joinMethod: isOrganizer ? 'organizer' : 'link',
    response: 'accepted',
    status: 'registered',
    ...(authUser ? { userId: authUser.id } : {}),
    ...(!authUser && email ? { email } : {}),
  };
  const notifyTenantId = authUser ? await notifyTenantFor(meeting, authUser) : undefined;
  const run = () =>
    MeetingParticipant.findOneAndUpdate(
      { meetingId: meeting._id, key },
      { $setOnInsert: insert, $set: { lastSeenAt: new Date(), inviteVersion: meeting.invite?.version || 1, ...(notifyTenantId ? { notifyTenantId } : {}) } },
      { upsert: true, new: true }
    );
  try {
    return await run();
  } catch (err) {
    // Two simultaneous joins by the same user: the unique index rejects the second insert. Reuse the first.
    if (err?.code === 11000) return MeetingParticipant.findOne({ meetingId: meeting._id, key });
    throw err;
  }
}

/**
 * Password + access-mode check → participant record + meeting pass.
 * Wrong-password answers are identical whether or not the meeting exists for other reasons.
 */
export async function joinViaLink(token, { password, name, email } = {}, authUser) {
  const meeting = await findByToken(token, { withPassword: true });
  assertEnabled(meeting);

  const phase = phaseOf(meeting);
  if (phase === 'ended' || phase === 'cancelled') {
    throw new ApiError(409, PHASE_MESSAGES[phase], { code: phase === 'cancelled' ? 'MEETING_CANCELLED' : 'MEETING_ENDED' });
  }
  const mode = meeting.invite?.accessMode || 'link';
  const isOrganizer = Boolean(authUser && String(meeting.organizerId) === authUser.id);
  const isListed = Boolean(authUser && meeting.participants.some((p) => p.userId && String(p.userId) === authUser.id));

  if (mode !== 'link' && !authUser) {
    throw new ApiError(401, 'Sign in to LifeOS to join this meeting.', { code: 'LOGIN_REQUIRED' });
  }
  if (mode === 'restricted' && !isOrganizer && !isListed) {
    throw new ApiError(403, "You don't have permission to join this meeting.", { code: 'NOT_INVITED' });
  }

  const guestName = authUser ? null : cleanName(name);
  if (!authUser && guestName.length < 2) {
    throw new ApiError(400, 'Enter your name to join.', { code: 'NAME_REQUIRED' });
  }

  // Organizer and (restricted mode) listed participants are already authorised; everyone else needs the password.
  const returning = !isOrganizer && (await isReturning(meeting, authUser));
  const needsPassword = !isOrganizer && !returning && !(mode === 'restricted' && isListed);
  if (needsPassword) {
    if (meeting.invite?.lockedUntil && meeting.invite.lockedUntil > new Date()) {
      throw new ApiError(429, 'Too many wrong passwords. Please wait a few minutes and try again.', { code: 'LINK_LOCKED' });
    }
    if (!password) throw new ApiError(400, 'Enter the meeting password.', { code: 'PASSWORD_REQUIRED' });
    const ok = await checkInvitePassword(password, meeting.invite?.passwordHash);
    if (!ok) {
      await registerFailure(meeting);
      throw new ApiError(403, 'Incorrect password.', { code: 'WRONG_PASSWORD' });
    }
    if (meeting.invite?.failedAttempts) await Meeting.updateOne({ _id: meeting._id }, { $set: { 'invite.failedAttempts': 0 } });
  }

  const participant = await upsertParticipant(meeting, { authUser, name: guestName, isOrganizer, email: authUser ? '' : cleanEmail(email) });
  const pass = signMeetingPass({ meetingId: meeting._id, participantId: participant._id, version: meeting.invite?.version || 1 });
  return {
    pass,
    participant: {
      id: String(participant._id),
      name: participant.displayName,
      role: participant.role,
      isGuest: Boolean(participant.isGuest),
      joinMethod: participant.joinMethod,
    },
    meeting: await fullDetails(meeting),
  };
}

/** Re-opens the invitation after a page reload using the pass the visitor already earned. */
export async function getSession(token, pass) {
  if (!pass) throw new ApiError(401, 'Enter the meeting password to continue.', { code: 'PASS_REQUIRED' });
  let payload;
  try {
    payload = verifyMeetingPass(pass);
  } catch {
    throw new ApiError(401, 'Your access has expired. Enter the password again.', { code: 'PASS_INVALID' });
  }
  const meeting = await findByToken(token);
  assertEnabled(meeting);
  if (String(meeting._id) !== payload.mid || (meeting.invite?.version || 1) !== payload.v) {
    throw new ApiError(401, 'Your access has expired. Enter the password again.', { code: 'PASS_INVALID' });
  }
  const participant = await MeetingParticipant.findOne({ _id: payload.pid, meetingId: meeting._id });
  if (!participant) throw new ApiError(401, 'Your access has expired. Enter the password again.', { code: 'PASS_INVALID' });
  await MeetingParticipant.updateOne({ _id: participant._id }, { $set: { lastSeenAt: new Date() } });
  return {
    participant: {
      id: String(participant._id),
      name: participant.displayName,
      role: participant.role,
      isGuest: Boolean(participant.isGuest),
      joinMethod: participant.joinMethod,
    },
    meeting: await fullDetails(meeting),
  };
}

// ── video room (link joiners) ───────────────────────────────────────────

/** Verifies a meeting pass and returns the meeting + the participant row it was issued to. */
export async function authorizePass(token, pass) {
  if (!pass) throw new ApiError(401, 'Enter the meeting password to continue.', { code: 'PASS_REQUIRED' });
  let payload;
  try {
    payload = verifyMeetingPass(pass);
  } catch {
    throw new ApiError(401, 'Your access has expired. Enter the password again.', { code: 'PASS_INVALID' });
  }
  const meeting = await findByToken(token);
  assertEnabled(meeting);
  if (String(meeting._id) !== payload.mid || (meeting.invite?.version || 1) !== payload.v) {
    throw new ApiError(401, 'Your access has expired. Enter the password again.', { code: 'PASS_INVALID' });
  }
  const participant = await MeetingParticipant.findOne({ _id: payload.pid, meetingId: meeting._id });
  if (!participant) throw new ApiError(401, 'Your access has expired. Enter the password again.', { code: 'PASS_INVALID' });

  // The organizer may tighten the access mode after someone already holds a pass: re-check it here.
  const mode = meeting.invite?.accessMode || 'link';
  if (mode !== 'link' && participant.isGuest) {
    throw new ApiError(401, 'Sign in to LifeOS to join this meeting.', { code: 'LOGIN_REQUIRED' });
  }
  if (mode === 'restricted' && participant.userId) {
    const isOrganizer = String(meeting.organizerId) === String(participant.userId);
    const isListed = meeting.participants.some((p) => p.userId && String(p.userId) === String(participant.userId));
    if (!isOrganizer && !isListed) throw new ApiError(403, "You don't have permission to join this meeting.", { code: 'NOT_INVITED' });
  }
  return { meeting, participant };
}

const isOrganizerRow = (meeting, participant) => Boolean(participant.userId && String(participant.userId) === String(meeting.organizerId));
const whoOf = (participant) => ({ key: participant.key, ...(participant.userId ? { userId: participant.userId } : {}), name: participant.displayName });

// ── recording (link joiners). Same rules as members; everything is saved on the ORGANIZER's meeting. ──

export async function claimRecordingViaLink(token, pass) {
  const { meeting, participant } = await authorizePass(token, pass);
  assertRoomOpen(meeting);
  return claimRecordingFor(meeting, whoOf(participant), isOrganizerRow(meeting, participant));
}

export async function releaseRecordingViaLink(token, pass) {
  const { meeting, participant } = await authorizePass(token, pass);
  return releaseRecordingFor(meeting, whoOf(participant));
}

export async function recordingBeatViaLink(token, pass, body) {
  const { meeting, participant } = await authorizePass(token, pass);
  return recordingBeatFor(meeting, whoOf(participant), body);
}

export async function uploadChunkViaLink(token, pass, index, buffer, contentType) {
  const { meeting, participant } = await authorizePass(token, pass);
  return storeChunk(meeting, whoOf(participant), isOrganizerRow(meeting, participant), index, buffer, contentType);
}

// ── chat (link joiners) ──

export async function chatSendViaLink(token, pass, text) {
  const { meeting, participant } = await authorizePass(token, pass);
  return chat.sendMessage(meeting, { key: participant.key, name: participant.displayName }, text);
}

export async function chatListViaLink(token, pass, after) {
  const { meeting } = await authorizePass(token, pass);
  return chat.listMessages(meeting, after);
}

/** Pass → video room token. Guests get a guest identity; signed-in people keep their account identity. */
export async function joinRoomViaLink(token, pass) {
  ensureVideo();
  const { meeting, participant } = await authorizePass(token, pass);
  assertRoomOpen(meeting);
  const isHost = isOrganizerRow(meeting, participant);
  const identity = participant.key; // u:<userId> or g:<random>
  const row = await markJoined(meeting, { key: participant.key });
  const lk = mintMeetingRoomToken({ meetingId: meeting._id, identity, name: row.displayName, host: isHost });
  const payload = buildRoomPayload(meeting, { token: lk, identity, participant: row, isHost });
  // The internal meeting id is only needed by the organizer (to open the full host controls).
  return isHost ? { ...payload, meetingId: String(meeting._id) } : payload;
}

export async function pingRoomViaLink(token, pass) {
  const { meeting, participant } = await authorizePass(token, pass);
  await MeetingParticipant.updateOne({ _id: participant._id, status: 'joined' }, { $set: { lastSeenAt: new Date() } });
  return { status: meeting.status, ...recordingSnapshot(meeting, { key: participant.key, isHost: isOrganizerRow(meeting, participant) }) };
}

export async function leaveRoomViaLink(token, pass) {
  const { participant } = await authorizePass(token, pass);
  await MeetingParticipant.updateOne({ _id: participant._id, status: 'joined' }, { $set: { status: 'left', leftAt: new Date() } });
  return { left: true };
}
