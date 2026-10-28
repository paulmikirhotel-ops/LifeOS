import { MeetingParticipant } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { loadForUser, canManage } from './meeting.service.js';
import { livekitConfigured, mintMeetingRoomToken, publicLivekitUrl, roomNameFor } from '../utils/livekit.js';
import { storageConfigured } from './storage.service.js';
import { recordingView } from './recordingSegments.js';

/**
 * Video room access.
 *
 * Two doors lead to the same room:
 *   1. Workspace members (organizer, listed participants, workspace owner) → /meetings/:id/room,
 *      authorised by their LifeOS session exactly like every other meeting endpoint.
 *   2. People who joined through the invitation link (guests or signed-in users from elsewhere)
 *      → /public/meet/:token/room, authorised by their meeting pass (see meetingInvite.service.js).
 *
 * Neither door gives access to anything except the room. Attendance (join / leave time) is recorded
 * on the MeetingParticipant row, which is what the meeting history and participant records read.
 */

export const isHttpUrl = (s) => /^https?:\/\/\S+$/i.test(String(s || '').trim());

/** The native room is used unless the organizer attached their own meeting URL (external fallback). */
export const usesNativeRoom = (meeting) => livekitConfigured() && !isHttpUrl(meeting.location);

export function ensureVideo() {
  if (!livekitConfigured()) {
    throw new ApiError(503, 'Video rooms are not set up on this server yet.', { code: 'VIDEO_NOT_CONFIGURED' });
  }
}

export function assertRoomOpen(meeting) {
  if (meeting.status === 'cancelled') throw new ApiError(409, 'This meeting has been cancelled.', { code: 'MEETING_CANCELLED' });
  if (meeting.status === 'completed') throw new ApiError(409, 'This meeting has ended.', { code: 'MEETING_ENDED' });
  if (meeting.status !== 'live') throw new ApiError(409, "This meeting hasn't started yet.", { code: 'MEETING_NOT_STARTED' });
}

/**
 * Marks a person as in the room. First join time is kept (`$min` also creates the field when it is
 * missing); a later re-join clears leftAt and flips the status back to joined. One row per person.
 */
export async function markJoined(meeting, { key, insert = {} }) {
  const now = new Date();
  const run = () =>
    MeetingParticipant.findOneAndUpdate(
      { meetingId: meeting._id, key },
      {
        $setOnInsert: { tenantId: meeting.tenantId, response: 'accepted', ...insert },
        $set: { status: 'joined', lastSeenAt: now },
        $min: { joinedAt: now },
        $unset: { leftAt: '' },
      },
      { upsert: true, new: true }
    );
  try {
    return await run();
  } catch (err) {
    // Two simultaneous joins by the same person: the unique (meetingId, key) index rejects the second insert.
    if (err?.code === 11000) return MeetingParticipant.findOne({ meetingId: meeting._id, key });
    throw err;
  }
}

/** Old name kept: is somebody really recording? (Understands both the old single-recorder flow and hand-off recording.) */
export function recordingActive(meeting) {
  return recordingView({ recording: meeting.toObject ? meeting.toObject().recording || {} : meeting.recording || {} }).recording;
}

/**
 * What one person's room needs to know about recording: is it on, who holds it, may THEY press Record.
 * `isHost` = organizer-level (always allowed); everyone else follows the organizer's "participants may record" switch.
 */
export function recordingSnapshot(meeting, { key, isHost }) {
  const obj = meeting.toObject ? meeting.toObject() : meeting;
  const view = recordingView({ recording: obj.recording || {}, who: key });
  return {
    recording: view.recording,
    recorder: view.recorder,
    canRecord: storageConfigured() && (Boolean(isHost) || obj.recordingPolicy?.anyone !== false),
    recordingStorage: storageConfigured(),
    hasAudio: (obj.recording?.sizeBytes || 0) > 0, // earlier audio exists → the button says "Continue recording"
  };
}

/** What the browser needs to connect. Never contains the API key or secret. */
export function buildRoomPayload(meeting, { token, identity, participant, isHost }) {
  return {
    url: publicLivekitUrl(),
    token,
    room: roomNameFor(meeting._id),
    identity,
    isHost,
    title: meeting.title,
    startedAt: meeting.startedAt || null,
    // Late joiners must know a recording is in progress the moment they arrive; the recorder fields drive "Start / Continue recording".
    ...recordingSnapshot(meeting, { key: identity, isHost }),
    participant: {
      id: String(participant._id),
      name: participant.displayName,
      role: participant.role,
      isGuest: Boolean(participant.isGuest),
    },
  };
}

// ── workspace members ───────────────────────────────────────────────────

export async function joinRoomAsMember(user, id) {
  ensureVideo();
  const meeting = await loadForUser(user, id);
  assertRoomOpen(meeting);

  const isHost = canManage(user, meeting);
  const key = `u:${user.id}`;
  const participant = await markJoined(meeting, {
    key,
    insert: {
      userId: user.id,
      displayName: user.name,
      isGuest: false,
      role: isHost ? 'chair' : 'attendee',
      joinMethod: String(meeting.organizerId) === String(user.id) ? 'organizer' : 'invited',
    },
  });

  const token = mintMeetingRoomToken({ meetingId: meeting._id, identity: key, name: participant.displayName || user.name, host: isHost });
  return buildRoomPayload(meeting, { token, identity: key, participant, isHost });
}

/** Heartbeat: keeps "last seen" fresh and tells the client if the meeting has ended or recording state changed. */
export async function pingRoomAsMember(user, id) {
  const meeting = await loadForUser(user, id);
  await MeetingParticipant.updateOne({ meetingId: meeting._id, key: `u:${user.id}`, status: 'joined' }, { $set: { lastSeenAt: new Date() } });
  return { status: meeting.status, ...recordingSnapshot(meeting, { key: `u:${user.id}`, isHost: canManage(user, meeting) }) };
}

export async function leaveRoomAsMember(user, id) {
  const meeting = await loadForUser(user, id);
  await MeetingParticipant.updateOne({ meetingId: meeting._id, key: `u:${user.id}`, status: 'joined' }, { $set: { status: 'left', leftAt: new Date() } });
  return { left: true };
}
