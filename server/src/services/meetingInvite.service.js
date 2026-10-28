import crypto from 'node:crypto';
import { Meeting, MeetingAttendance, Membership, User, CalendarEvent } from '../models/index.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { hashToken } from '../utils/token.js';
import { assertObjectId } from '../utils/objectId.js';
import * as notificationService from './notification.service.js';
import { AuditService } from './audit.service.js';

/**
 * Shareable meeting invitation links.
 *
 * ── The link ────────────────────────────────────────────────────────────────
 *   https://<app>/meet/<code>
 *
 * `code` is 72 bits of CSPRNG output in base64url (12 chars). It is NOT the
 * Mongo _id, because requirement 22 forbids predictable ids in a public URL.
 * Regenerating the code invalidates every previously distributed link.
 *
 * ── Access rules ────────────────────────────────────────────────────────────
 * Three modes, chosen by the organizer (`meeting.access.mode`):
 *   public        anyone with the link
 *   authenticated must be signed in to LifeOS
 *   restricted    only people the organizer invited (or approved)
 * …combined with two switches: `allowGuests` (join without an account) and
 * `requireApproval` (land in a pending state instead of joining).
 *
 * Every visitor gets an explicit `action` telling the UI exactly what to show —
 * the client never has to re-implement (and mis-implement) these rules.
 *
 * ── Privacy ─────────────────────────────────────────────────────────────────
 * The public payload deliberately omits the meeting's internal id, the recording,
 * the transcript and the participant list unless the organizer enabled it. The
 * internal id is only revealed AFTER a successful join.
 */

const DEFAULT_LINK_TTL_DAYS = 180;

// ── code generation ─────────────────────────────────────────────────────

/** 9 bytes → 12 base64url chars, URL-safe and unguessable. */
export function newInviteCode() {
  return crypto.randomBytes(9).toString('base64url');
}

export function buildInviteUrl(code) {
  return `${env.appUrl}/meet/${code}`;
}

/**
 * Returns the meeting's invitation code, creating one if absent.
 * Idempotent: concurrent callers converge on the same code because the unique
 * index on `invite.code` makes the loser of the race retry against the winner.
 */
export async function ensureInviteCode(meeting) {
  if (meeting.invite?.code && !meeting.invite.revokedAt) return meeting.invite.code;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newInviteCode();
    try {
      const updated = await Meeting.findOneAndUpdate(
        { _id: meeting._id, $or: [{ 'invite.code': { $exists: false } }, { 'invite.code': null }] },
        {
          $set: {
            'invite.code': code,
            'invite.createdAt': new Date(),
            'invite.revokedAt': null,
          },
          $inc: { 'invite.version': 1 },
        },
        { new: true }
      );
      if (updated) return updated.invite.code;

      // Someone else set it first — use theirs.
      const current = await Meeting.findById(meeting._id).select('invite').lean();
      if (current?.invite?.code) return current.invite.code;
    } catch (err) {
      // Duplicate code (astronomically unlikely) — try another one.
      if (err?.code !== 11000) throw err;
    }
  }
  throw new ApiError(500, 'Could not allocate a meeting link');
}

// ── access evaluation ───────────────────────────────────────────────────

function isOrganizer(user, meeting) {
  return Boolean(user) && String(meeting.organizerId) === String(user.id);
}

/** Is this signed-in user on the organizer's invitation list (id or email)? */
function isInvitedParticipant(user, meeting) {
  if (!user) return false;
  const email = String(user.email || '').toLowerCase();
  return (meeting.participants || []).some(
    (p) =>
      (p.userId && String(p.userId) === String(user.id)) ||
      (p.email && email && String(p.email).toLowerCase() === email)
  );
}

/**
 * Decides what a visitor may do, without side effects.
 *
 * @returns {{ action: string, reason: string|null, viewer: object, canSeeParticipants: boolean }}
 *   action ∈ invalid | expired | cancelled | ended | not_started | signin | restricted |
 *            request | join | waiting
 */
export function evaluateAccess(meeting, { user = null, hasGuestIdentity = false } = {}) {
  const access = meeting.access || {};

  if (!meeting.invite?.code || meeting.invite.revokedAt) {
    return { action: 'invalid', reason: 'This meeting link is no longer active.', canSeeParticipants: false };
  }
  if (meeting.invite.expiresAt && new Date(meeting.invite.expiresAt) < new Date()) {
    return { action: 'expired', reason: 'This meeting link has expired.', canSeeParticipants: false };
  }
  if (meeting.status === 'cancelled') {
    return { action: 'cancelled', reason: 'This meeting was cancelled.', canSeeParticipants: false };
  }
  if (meeting.status === 'completed') {
    return { action: 'ended', reason: 'This meeting has ended.', canSeeParticipants: true };
  }

  const organizer = isOrganizer(user, meeting);
  const invited = isInvitedParticipant(user, meeting);
  const privileged = organizer || invited;

  // Mode gate. An invited person always passes; they were explicitly added.
  if (!privileged) {
    if (access.mode === 'restricted') {
      if (!user) {
        return {
          action: 'signin',
          reason: 'This meeting is restricted. Sign in to check whether you have access.',
          canSeeParticipants: false,
        };
      }
      return {
        action: access.requireApproval ? 'request' : 'restricted',
        reason: access.requireApproval
          ? null
          : 'You don’t have permission to join this meeting. Ask the organizer to invite you.',
        canSeeParticipants: false,
      };
    }
    if (access.mode === 'authenticated' && !user) {
      return {
        action: 'signin',
        reason: 'Sign in to your LifeOS account to join this meeting.',
        canSeeParticipants: Boolean(access.showParticipants),
      };
    }
    if (access.mode === 'public' && !user && !access.allowGuests) {
      return {
        action: 'signin',
        reason: 'Sign in or create a LifeOS account to join this meeting.',
        canSeeParticipants: Boolean(access.showParticipants),
      };
    }
  }

  // Not started yet: show the invitation, but the room opens at start time.
  const startMs = new Date(meeting.startAt).getTime();
  const earlyWindowMs = 15 * 60 * 1000; // organizers commonly open 15 min early
  if (meeting.status === 'scheduled' && Date.now() < startMs - earlyWindowMs && !organizer) {
    return {
      action: 'not_started',
      reason: null,
      canSeeParticipants: Boolean(access.showParticipants),
      viewer: { isOrganizer: organizer, isInvited: invited },
    };
  }

  if (access.requireApproval && !privileged) {
    return {
      action: hasGuestIdentity ? 'waiting' : 'request',
      reason: null,
      canSeeParticipants: Boolean(access.showParticipants),
      viewer: { isOrganizer: organizer, isInvited: invited },
    };
  }

  return {
    action: 'join',
    reason: null,
    canSeeParticipants: Boolean(access.showParticipants) || privileged,
    viewer: { isOrganizer: organizer, isInvited: invited },
  };
}

/** Loads a meeting by invitation code. Never leaks whether an id exists. */
async function loadByCode(code) {
  const clean = String(code || '').trim();
  // Codes are 12 chars; reject nonsense before touching the database.
  if (clean.length < 8 || clean.length > 40 || !/^[A-Za-z0-9_-]+$/.test(clean)) {
    throw ApiError.notFound('This meeting link is not valid.');
  }
  const meeting = await Meeting.findOne({ 'invite.code': clean });
  if (!meeting) throw ApiError.notFound('This meeting link is not valid.');
  return meeting;
}

// ── public invitation view ──────────────────────────────────────────────

function displayStatus(meeting) {
  if (meeting.status === 'live') return 'live';
  if (meeting.status === 'cancelled') return 'cancelled';
  if (meeting.status === 'completed') return 'ended';
  const start = new Date(meeting.startAt).getTime();
  if (Date.now() >= start - 15 * 60 * 1000 && Date.now() < new Date(meeting.endAt).getTime()) return 'starting_soon';
  return 'upcoming';
}

/**
 * The invitation page payload. Safe to serve to anyone holding the code —
 * the access decision is computed per viewer and only the fields that viewer is
 * entitled to see are returned.
 */
export async function getInvitation(code, { user = null, hasGuestIdentity = false } = {}) {
  const meeting = await loadByCode(code);
  const decision = evaluateAccess(meeting, { user, hasGuestIdentity });
  const access = meeting.access || {};

  const organizer = await User.findById(meeting.organizerId).select('name').lean();

  // Participant names are only exposed when the organizer allows it AND the
  // viewer is allowed to see them. The COUNT alone is safe and is what the
  // invitation page advertises.
  const participants = (meeting.participants || []).map((p) => ({
    name: p.name,
    role: p.role,
  }));

  const attendance = await MeetingAttendance.countDocuments({ meetingId: meeting._id });

  return {
    link: {
      code: meeting.invite.code,
      url: buildInviteUrl(meeting.invite.code),
      version: meeting.invite.version || 0,
    },
    meeting: {
      title: meeting.title,
      description: meeting.description || null,
      type: meeting.type,
      agenda: meeting.agenda || null,
      location: meeting.location || null,
      timezone: meeting.timezone,
      startAt: meeting.startAt,
      endAt: meeting.endAt,
      status: meeting.status,
      displayStatus: displayStatus(meeting),
    },
    organizer: { name: organizer?.name || 'A LifeOS user' },
    participants: {
      count: Math.max(participants.length, attendance),
      // Names are withheld unless allowed, so a leaked link cannot enumerate the
      // guest list of a meeting.
      names: decision.canSeeParticipants ? participants.map((p) => p.name) : null,
      showNames: Boolean(decision.canSeeParticipants),
    },
    access: {
      mode: access.mode || 'authenticated',
      allowGuests: Boolean(access.allowGuests),
      requireApproval: Boolean(access.requireApproval),
      // External room (Zoom/Meet/Teams) — safe to expose, the organizer shared it.
      externalUrl: access.externalUrl || null,
    },
    viewer: {
      signedIn: Boolean(user),
      name: user?.name || null,
      email: user?.email || null,
      isOrganizer: Boolean(decision.viewer?.isOrganizer),
      isInvited: Boolean(decision.viewer?.isInvited),
      action: decision.action,
      reason: decision.reason,
    },
  };
}

// ── attendance helpers ──────────────────────────────────────────────────

function guestKeyFrom(raw) {
  const value = String(raw || '').trim();
  if (value.length < 16 || value.length > 200) return null;
  return hashToken(`lifeos-guest:${value}`);
}

/** Raises an ApiError explaining why the visitor may not join. */
function assertActionable(decision) {
  if (decision.action === 'join' || decision.action === 'request') return;
  const messages = {
    invalid: 'This meeting link is not valid.',
    expired: 'This meeting link has expired.',
    cancelled: 'This meeting was cancelled.',
    ended: 'This meeting has ended.',
    signin: decision.reason || 'Please sign in to join this meeting.',
    restricted: 'You don’t have permission to join this meeting.',
  };
  if (decision.action === 'signin') throw ApiError.unauthorized(messages.signin);
  if (decision.action === 'restricted') throw ApiError.forbidden(messages.restricted);
  if (decision.action === 'not_started') {
    throw ApiError.conflict('This meeting hasn’t started yet. The join button opens shortly before it begins.');
  }
  throw ApiError.badRequest(messages[decision.action] || 'You cannot join this meeting.');
}

/** Adds the joiner to the organizer's participant list so notifications reach them. */
async function attachParticipant(meeting, { user, guestName, guestEmail }) {
  const existing = (meeting.participants || []).some(
    (p) => (user && p.userId && String(p.userId) === String(user.id)) || (!user && guestName && p.name === guestName)
  );
  if (existing) return;

  const entry = user
    ? { userId: user.id, name: user.name, email: user.email, role: 'attendee' }
    : { name: guestName, email: guestEmail, role: 'attendee' };

  await Meeting.updateOne({ _id: meeting._id }, { $push: { participants: entry } });
  meeting.participants.push(entry);
}

/**
 * Records (or updates) a person's attendance row.
 *
 * Repeat joins NEVER create a second row: the unique partial indexes on
 * (meetingId,userId) and (meetingId,guestKey) make the upsert converge, and the
 * update path preserves `firstJoinedAt` while refreshing `lastJoinedAt`.
 */
async function upsertAttendance(meeting, { user, guestKeyRaw, guestName, guestEmail, joinMethod, state }) {
  const guestKey = user ? null : guestKeyFrom(guestKeyRaw);
  const displayName = user ? user.name : String(guestName || '').trim();

  if (!displayName) {
    throw ApiError.badRequest('Please enter your name so the organizer knows who joined.');
  }
  if (!user && !guestKey) {
    throw ApiError.badRequest('A guest pass is required to join as a guest. Please reload the page and try again.');
  }

  const query = user ? { meetingId: meeting._id, userId: user.id } : { meetingId: meeting._id, guestKey };

  const now = new Date();
  const set = {
    tenantId: meeting.tenantId,
    meetingId: meeting._id,
    name: displayName,
    attendance: state,
    lastSeenAt: now,
  };
  if (user) set.userId = user.id;
  else set.guestKey = guestKey;
  if (guestEmail) set.email = String(guestEmail).toLowerCase().slice(0, 254);
  else if (user?.email) set.email = user.email;
  if (meeting.status === 'live') {
    set.lastJoinedAt = now;
    set.leftAt = null;
  }

  const result = await MeetingAttendance.findOneAndUpdate(
    query,
    {
      $set: set,
      $setOnInsert: {
        role: isOrganizer(user, meeting) ? 'organizer' : user ? 'attendee' : 'guest',
        joinMethod,
        firstJoinedAt: meeting.status === 'live' ? now : null,
        joinCount: 0,
        canViewParticipants: true,
      },
      $inc: { joinCount: meeting.status === 'live' ? 1 : 0 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return result;
}

// ── join / request / leave ──────────────────────────────────────────────

/**
 * The join flow behind the invitation page's JOIN MEETING button.
 * Everything is derived server-side; the client only supplies identity.
 */
export async function joinViaInvite(code, { user = null, guestKeyRaw, guestName, guestEmail, requestOnly = false } = {}) {
  const meeting = await loadByCode(code);
  const decision = evaluateAccess(meeting, { user, hasGuestIdentity: Boolean(guestKeyRaw) });

  const wantsRequest = requestOnly || decision.action === 'request' || meeting.access?.requireApproval;

  if (decision.action === 'signin') {
    // A signed-out visitor without guest access still gets a useful answer.
    throw ApiError.unauthorized(decision.reason || 'Please sign in to join this meeting.');
  }
  if (decision.action === 'restricted') {
    throw ApiError.forbidden('You don’t have permission to join this meeting.');
  }
  if (['invalid', 'expired', 'cancelled', 'ended'].includes(decision.action)) assertActionable(decision);
  if (!wantsRequest) assertActionable(decision);

  // Guests need the switch on; signed-in users never do.
  if (!user && !meeting.access?.allowGuests) {
    throw ApiError.forbidden('This meeting requires a LifeOS account. Sign in or create one to join.');
  }

  const privileged = decision.viewer?.isOrganizer || decision.viewer?.isInvited;
  const state = wantsRequest && !privileged ? 'requested' : 'attended';

  const attendance = await upsertAttendance(meeting, {
    user,
    guestKeyRaw,
    guestName,
    guestEmail,
    joinMethod: 'link',
    state,
  });

  // Only people who are actually allowed in join the participant list. Someone
  // awaiting approval must not appear to be coming.
  if (state === 'attended') {
    await attachParticipant(meeting, { user, guestName, guestEmail });
  } else if (user) {
    // Let the organizer know there is a pending request.
    notificationService.notify({
      tenantId: meeting.tenantId,
      userId: meeting.organizerId,
      type: 'meeting',
      module: 'meeting',
      title: 'Someone asked to join your meeting',
      message: `${user.name} requested to join “${meeting.title}”.`,
      relatedId: meeting._id,
      priority: 'high',
      data: { meetingId: String(meeting._id), attendanceId: String(attendance._id) },
    });
  }

  return {
    meetingId: String(meeting._id),
    attendanceId: String(attendance._id),
    state,
    requiresApproval: state === 'requested',
    // This is the first point at which the internal id is disclosed.
    roomPath: `/meetings/${meeting._id}/live`,
    meeting: {
      title: meeting.title,
      startAt: meeting.startAt,
      endAt: meeting.endAt,
      timezone: meeting.timezone,
      status: meeting.status,
    },
  };
}

/**
 * Join from INSIDE the app (the meeting room's own "Join" action), where the
 * user is already authenticated and therefore already tenant-scoped. No code is
 * involved, so the access mode does not gate this path — the normal meeting
 * access filter (`loadForUser`) already decided they may see the meeting.
 */
export async function joinAsMember(user, meetingId) {
  assertObjectId(meetingId);
  const meeting = await Meeting.findOne({ _id: meetingId, tenantId: user.tenantId });
  if (!meeting) throw ApiError.notFound('Meeting not found');
  if (meeting.status === 'cancelled') throw ApiError.conflict('This meeting was cancelled.');

  const attendance = await upsertAttendance(meeting, {
    user,
    joinMethod: 'direct',
    state: meeting.status === 'live' ? 'attended' : 'approved',
  });

  return {
    meetingId: String(meeting._id),
    attendanceId: String(attendance._id),
    attendance: attendance.attendance,
  };
}

/** Accept / decline from the "Invitations" list or the invitation page. */
export async function respondToInvitation(user, meetingId, response) {
  assertObjectId(meetingId);
  const meeting = await Meeting.findOne({ _id: meetingId, tenantId: user.tenantId }).lean();
  if (!meeting) throw ApiError.notFound('Meeting not found');

  const attendance = await MeetingAttendance.findOneAndUpdate(
    { meetingId: meeting._id, userId: user.id },
    {
      $set: {
        response,
        respondedAt: new Date(),
        attendance: response === 'declined' ? 'declined' : 'attended',
      },
      $setOnInsert: {
        tenantId: meeting.tenantId,
        meetingId: meeting._id,
        userId: user.id,
        name: user.name,
        email: user.email,
        role: 'attendee',
        joinMethod: 'direct',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  notificationService.notify({
    tenantId: meeting.tenantId,
    userId: meeting.organizerId,
    type: 'meeting',
    module: 'meeting',
    title: response === 'declined' ? 'Invitation declined' : 'Invitation accepted',
    message: `${user.name} ${response === 'declined' ? 'declined' : 'accepted'} “${meeting.title}”.`,
    relatedId: meeting._id,
    data: { meetingId: String(meeting._id) },
  });

  return { meetingId: String(meeting._id), response, attendanceId: String(attendance._id) };
}

/** Records a departure and accrues attendance time. */
export async function leaveMeeting(user, meetingId) {
  assertObjectId(meetingId);
  const now = new Date();
  const row = await MeetingAttendance.findOne({ meetingId, userId: user.id });
  if (!row) return { left: false };

  const elapsed = row.lastJoinedAt ? Math.round((now - new Date(row.lastJoinedAt)) / 1000) : 0;
  row.leftAt = now;
  row.attendedSec = (row.attendedSec || 0) + Math.max(0, elapsed);
  await row.save();

  return { left: true, attendedSec: row.attendedSec };
}

/** "Save to my LifeOS calendar" for a signed-in viewer who is not joining yet. */
export async function addInviteToMyCalendar(user, code) {
  const meeting = await loadByCode(code);

  const existing = await CalendarEvent.findOne({
    tenantId: user.tenantId,
    userId: user.id,
    meetingId: meeting._id,
  }).lean();

  if (existing) return { calendarEventId: String(existing._id), alreadyAdded: true };

  const event = await CalendarEvent.create({
    tenantId: user.tenantId,
    userId: user.id,
    title: meeting.title,
    type: 'meeting',
    description: meeting.description,
    allDay: false,
    startAt: meeting.startAt,
    endAt: meeting.endAt,
    meetingId: meeting._id,
  });

  await upsertAttendance(meeting, {
    user,
    joinMethod: 'link',
    state: 'invited',
  });

  return { calendarEventId: String(event._id), alreadyAdded: false };
}

// ── organizer-side management ───────────────────────────────────────────

function canManage(user, meeting) {
  return user.tenantRole === 'owner' || String(meeting.organizerId) === String(user.id);
}

export async function organizerInviteInfo(user, meetingId) {
  assertObjectId(meetingId);
  const meeting = await Meeting.findOne({ _id: meetingId, tenantId: user.tenantId });
  if (!meeting) throw ApiError.notFound('Meeting not found');
  if (!canManage(user, meeting)) throw ApiError.forbidden('Only the organizer can manage the invitation link');

  const code = await ensureInviteCode(meeting);
  const [counts, guestCount] = await Promise.all([
    MeetingAttendance.countDocuments({ meetingId: meeting._id }),
    MeetingAttendance.countDocuments({ meetingId: meeting._id, userId: null }),
  ]);

  return {
    code,
    url: buildInviteUrl(code),
    version: meeting.invite?.version || 0,
    createdAt: meeting.invite?.createdAt || null,
    regeneratedAt: meeting.invite?.regeneratedAt || null,
    expiresAt: meeting.invite?.expiresAt || null,
    access: {
      mode: meeting.access?.mode || 'authenticated',
      allowGuests: Boolean(meeting.access?.allowGuests),
      requireApproval: Boolean(meeting.access?.requireApproval),
      showParticipants: Boolean(meeting.access?.showParticipants),
      externalUrl: meeting.access?.externalUrl || null,
    },
    attendance: { total: counts, guests: guestCount },
  };
}

/**
 * Issues a brand-new code. Every previously shared link stops working
 * immediately — this is the organizer's remedy if a link leaks.
 */
export async function regenerateInvite(user, meetingId) {
  assertObjectId(meetingId);
  const meeting = await Meeting.findOne({ _id: meetingId, tenantId: user.tenantId });
  if (!meeting) throw ApiError.notFound('Meeting not found');
  if (!canManage(user, meeting)) throw ApiError.forbidden('Only the organizer can regenerate the meeting link');

  // Retry only on the (astronomically unlikely) unique-index collision.
  let code;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = newInviteCode();
    try {
      const updated = await Meeting.findOneAndUpdate(
        { _id: meeting._id },
        {
          $set: {
            'invite.code': candidate,
            'invite.regeneratedAt': new Date(),
            'invite.revokedAt': null,
          },
          $inc: { 'invite.version': 1 },
        },
        { new: true }
      );
      code = updated.invite.code;
      break;
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
  if (!code) throw new ApiError(500, 'Could not regenerate the meeting link');

  AuditService.log({
    tenantId: meeting.tenantId,
    userId: user.id,
    action: 'meeting.invite.regenerate',
    resource: 'meeting',
    resourceId: meeting._id,
    details: { version: (meeting.invite?.version || 0) + 1 },
  });

  return { code, url: buildInviteUrl(code), version: (meeting.invite?.version || 0) + 1 };
}

/** Turns the link off entirely without deleting the meeting. */
export async function revokeInvite(user, meetingId) {
  assertObjectId(meetingId);
  const meeting = await Meeting.findOne({ _id: meetingId, tenantId: user.tenantId });
  if (!meeting) throw ApiError.notFound('Meeting not found');
  if (!canManage(user, meeting)) throw ApiError.forbidden('Only the organizer can disable the meeting link');

  await Meeting.updateOne({ _id: meeting._id }, { $set: { 'invite.revokedAt': new Date() } });
  return { revoked: true };
}

export async function updateAccess(user, meetingId, patch = {}) {
  assertObjectId(meetingId);
  const meeting = await Meeting.findOne({ _id: meetingId, tenantId: user.tenantId }).lean();
  if (!meeting) throw ApiError.notFound('Meeting not found');
  if (!canManage(user, meeting)) throw ApiError.forbidden('Only the organizer can change meeting access');

  const set = {};
  if (patch.mode !== undefined) {
    if (!['public', 'authenticated', 'restricted'].includes(patch.mode)) {
      throw ApiError.badRequest('Unknown access mode');
    }
    set['access.mode'] = patch.mode;
  }
  if (patch.allowGuests !== undefined) set['access.allowGuests'] = Boolean(patch.allowGuests);
  if (patch.requireApproval !== undefined) set['access.requireApproval'] = Boolean(patch.requireApproval);
  if (patch.showParticipants !== undefined) set['access.showParticipants'] = Boolean(patch.showParticipants);
  if (patch.externalUrl !== undefined) {
    const url = patch.externalUrl ? String(patch.externalUrl).trim().slice(0, 1000) : '';
    // Only http(s) — never let a meeting field smuggle a javascript: URL.
    if (url && !/^https?:\/\//i.test(url)) {
      throw ApiError.badRequest('The meeting link must start with http:// or https://');
    }
    set['access.externalUrl'] = url || null;
  }

  if (Object.keys(set).length === 0) throw ApiError.badRequest('Nothing to update');

  const updated = await Meeting.findOneAndUpdate({ _id: meetingId }, { $set: set }, { new: true }).lean();

  return {
    access: {
      mode: updated.access.mode,
      allowGuests: updated.access.allowGuests,
      requireApproval: updated.access.requireApproval,
      showParticipants: updated.access.showParticipants,
      externalUrl: updated.access.externalUrl,
    },
  };
}

// ── attendance roster ───────────────────────────────────────────────────

export async function listAttendance(user, meetingId) {
  assertObjectId(meetingId);
  const meeting = await Meeting.findOne({ _id: meetingId, tenantId: user.tenantId }).lean();
  if (!meeting) throw ApiError.notFound('Meeting not found');

  const rows = await MeetingAttendance.find({ meetingId: meeting._id }).sort({ createdAt: 1 }).lean();

  return {
    items: rows.map((r) => ({
      id: String(r._id),
      userId: r.userId ? String(r.userId) : null,
      isGuest: !r.userId,
      name: r.name,
      email: r.email || null,
      role: r.role,
      joinMethod: r.joinMethod,
      attendance: r.attendance,
      response: r.response,
      firstJoinedAt: r.firstJoinedAt,
      lastJoinedAt: r.lastJoinedAt,
      leftAt: r.leftAt,
      joinCount: r.joinCount,
      attendedSec: r.attendedSec,
    })),
    counts: rows.reduce(
      (acc, r) => {
        acc.total += 1;
        acc[r.attendance] = (acc[r.attendance] || 0) + 1;
        if (!r.userId) acc.guests += 1;
        return acc;
      },
      { total: 0, guests: 0 }
    ),
  };
}

/** Approve or decline a pending join request. */
export async function reviewAttendance(user, meetingId, attendanceId, decision) {
  assertObjectId(meetingId);
  assertObjectId(attendanceId, 'attendanceId');

  const meeting = await Meeting.findOne({ _id: meetingId, tenantId: user.tenantId });
  if (!meeting) throw ApiError.notFound('Meeting not found');
  if (!canManage(user, meeting)) throw ApiError.forbidden('Only the organizer can review join requests');

  const row = await MeetingAttendance.findOne({ _id: attendanceId, meetingId: meeting._id });
  if (!row) throw ApiError.notFound('Join request not found');

  row.attendance = decision === 'approve' ? 'approved' : 'declined';
  row.response = decision === 'approve' ? 'accepted' : 'declined';
  row.respondedAt = new Date();
  await row.save();

  if (decision === 'approve') {
    if (row.userId) {
      await attachParticipant(meeting, { user: { id: String(row.userId), name: row.name, email: row.email } });
      notificationService.notify({
        tenantId: meeting.tenantId,
        userId: row.userId,
        type: 'meeting',
        module: 'meeting',
        title: 'Your request to join was approved',
        message: `You can now join “${meeting.title}”.`,
        relatedId: meeting._id,
        priority: 'high',
        data: { meetingId: String(meeting._id) },
      });
    }
  }

  return { id: String(row._id), attendance: row.attendance };
}

/** Removes someone from the meeting (organizer action). */
export async function removeAttendance(user, meetingId, attendanceId) {
  assertObjectId(meetingId);
  assertObjectId(attendanceId, 'attendanceId');

  const meeting = await Meeting.findOne({ _id: meetingId, tenantId: user.tenantId });
  if (!meeting) throw ApiError.notFound('Meeting not found');
  if (!canManage(user, meeting)) throw ApiError.forbidden('Only the organizer can remove participants');

  const row = await MeetingAttendance.findOne({ _id: attendanceId, meetingId: meeting._id });
  if (!row) throw ApiError.notFound('Participant not found');

  row.attendance = 'removed';
  await row.save();

  if (row.userId) {
    await Meeting.updateOne({ _id: meeting._id }, { $pull: { participants: { userId: row.userId } } });
  } else {
    await Meeting.updateOne({ _id: meeting._id }, { $pull: { participants: { name: row.name } } });
  }

  return { id: String(row._id), attendance: 'removed' };
}

/**
 * The "Invitations" tab: meetings this user was invited to that still need an
 * answer, plus ones they accepted but have not joined.
 */
export async function listMyInvitations(user) {
  const rows = await MeetingAttendance.find({
    tenantId: user.tenantId,
    userId: user.id,
    attendance: { $in: ['invited', 'requested', 'approved', 'attended'] },
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  if (rows.length === 0) return { items: [], pending: 0 };

  const meetings = await Meeting.find({
    tenantId: user.tenantId,
    _id: { $in: rows.map((r) => r.meetingId) },
  })
    .select('title description type agenda location timezone startAt endAt status organizerId invite access')
    .lean();

  const byId = new Map(meetings.map((m) => [String(m._id), m]));

  const items = rows
    .map((row) => {
      const meeting = byId.get(String(row.meetingId));
      if (!meeting) return null;
      if (['cancelled'].includes(meeting.status)) return null;
      return {
        meetingId: String(meeting._id),
        title: meeting.title,
        type: meeting.type,
        startAt: meeting.startAt,
        endAt: meeting.endAt,
        timezone: meeting.timezone,
        location: meeting.location || meeting.access?.externalUrl || null,
        status: meeting.status,
        organizerId: String(meeting.organizerId),
        isOrganizer: String(meeting.organizerId) === String(user.id),
        inviteUrl: meeting.invite?.code ? buildInviteUrl(meeting.invite.code) : null,
        myResponse: row.response,
        myAttendance: row.attendance,
        joinCount: row.joinCount,
      };
    })
    .filter(Boolean);

  return { items, pending: items.filter((i) => i.myResponse === 'pending').length };
}

/** Marks people who never joined as no-shows once a meeting completes. */
export async function markNoShows(meetingId) {
  await MeetingAttendance.updateMany(
    { meetingId, attendance: { $in: ['invited', 'approved'] } },
    { $set: { attendance: 'no_show' } }
  );
}

/** All invitations a user must act on, used to badge the Meetings nav. */
export async function pendingInviteCount(user) {
  return MeetingAttendance.countDocuments({
    tenantId: user.tenantId,
    userId: user.id,
    response: 'pending',
  });
}

export { buildInviteUrl as inviteUrlFor, DEFAULT_LINK_TTL_DAYS };
