import { MeetingMessage } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { cleanMessage } from '../utils/chatText.js';

/**
 * In-meeting chat. Used by both doors (workspace members and link joiners); the caller has already proved who the
 * sender is and that they may be in this meeting. Messages are stored on the meeting, so the organizer owns them.
 */

const ID_RE = /^[a-f0-9]{24}$/i;
const FLOOD_WINDOW_MS = 10_000;
const FLOOD_MAX = 8;

const shape = (m) => ({ id: String(m._id), key: m.key, name: m.name, text: m.text, at: m.createdAt });

export async function sendMessage(meeting, who, rawText) {
  if (meeting.status !== 'live') throw ApiError.conflict('Chat is only open while the meeting is live', { code: 'MEETING_NOT_LIVE' });
  const text = cleanMessage(rawText);
  if (!text) throw ApiError.badRequest('Type a message first');
  const recent = await MeetingMessage.countDocuments({ meetingId: meeting._id, key: who.key, createdAt: { $gt: new Date(Date.now() - FLOOD_WINDOW_MS) } });
  if (recent >= FLOOD_MAX) throw new ApiError(429, 'You are sending messages too quickly.', { code: 'RATE_LIMITED' });
  const doc = await MeetingMessage.create({ tenantId: meeting.tenantId, meetingId: meeting._id, key: who.key, name: String(who.name || 'Guest').slice(0, 120), text });
  return shape(doc);
}

/** Messages after `after` (a message id), oldest first. Without `after`: the latest 100. */
export async function listMessages(meeting, after) {
  const q = { meetingId: meeting._id };
  if (after && ID_RE.test(String(after))) {
    q._id = { $gt: after };
    const rows = await MeetingMessage.find(q).sort({ _id: 1 }).limit(100).lean();
    return { items: rows.map(shape) };
  }
  const rows = await MeetingMessage.find(q).sort({ _id: -1 }).limit(100).lean();
  return { items: rows.reverse().map(shape) };
}
