import mongoose from 'mongoose';
import { User, ConnectConversation, ConnectMessage, ConnectCall } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import * as realtime from './realtime.js';
import { notifyMany } from './connectNotify.service.js';
import { loadConversation, assertCanWrite } from './connect.service.js';
import { livekitConfigured, mintMeetingRoomToken, publicLivekitUrl, roomNameFor } from '../utils/livekit.js';
import { RING_MS, STALE_MS, MAX_ON_CALL, callLogText, shouldEnd, allDeclined, isRingExpired } from '../utils/callLogic.js';
import { pushToUser } from './push.service.js';

/**
 * Voice and video calls in Connect chats.
 *
 * The audio/video runs on LiveKit (the same service as meeting rooms). This service decides who may ring whom,
 * who may enter the room (only members of the conversation, and for private chats only while they are still friends),
 * and writes a short "Voice call · 3 min" / "Missed voice call" line into the chat when the call is over.
 * Media is protected in transit between each browser and the media server; we do not claim end-to-end encryption.
 */

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const push = (userId, payload) => realtime.emitToUser(userId, 'connect', payload);
const LIVE = ['ringing', 'active'];
const joinedOf = (call) => call.participants.filter((p) => p.state === 'joined');

export function callsEnabled() {
  return livekitConfigured();
}

function ensureEnabled() {
  if (!callsEnabled()) throw new ApiError(503, 'Calls are not set up on this server yet.', { code: 'VIDEO_NOT_CONFIGURED' });
}

async function nameOf(userId) {
  const u = await User.findById(userId).select('name').lean();
  return u?.name || 'Someone';
}

/** What the browser needs to show a call (no tokens here). `me` decides the "title" for private chats. */
function toDto(call, conv, callerName) {
  const group = conv.type === 'group';
  return {
    id: String(call._id),
    conversationId: String(call.conversationId),
    mode: call.mode,
    status: call.status,
    group,
    callerId: String(call.callerId),
    callerName,
    title: group ? conv.name || 'Group call' : callerName,
    startedAt: call.startedAt || null,
    ringingUntil: new Date(new Date(call.createdAt).getTime() + RING_MS),
    joined: joinedOf(call).map((p) => String(p.userId)),
  };
}

const membersOf = (conv) => conv.members.map(String);
const tell = (conv, payload, skip) => membersOf(conv).filter((m) => m !== String(skip)).forEach((m) => push(m, payload));

async function loadCallFor(me, callId) {
  if (!mongoose.isValidObjectId(callId)) throw ApiError.notFound('Call not found.');
  const call = await ConnectCall.findById(callId);
  if (!call) throw ApiError.notFound('Call not found.');
  const conv = await ConnectConversation.findOne({ _id: call.conversationId, members: oid(me) });
  if (!conv) throw ApiError.notFound('Call not found.'); // same answer for "missing" and "not yours"
  return { call, conv };
}

/** Ends a call exactly once (two people hanging up at the same moment cannot log it twice), writes the chat line, tells everyone. */
async function finish(call, conv, reason) {
  const now = new Date();
  const done = await ConnectCall.findOneAndUpdate(
    { _id: call._id, status: { $in: LIVE } },
    { $set: { status: 'ended', endReason: reason, endedAt: now } },
    { new: true }
  );
  if (!done) return null;
  // "completed" without anybody ever answering is a missed call
  const real = reason === 'completed' && !done.startedAt ? 'missed' : reason;
  const text = callLogText({ mode: done.mode, reason: real, startedAt: done.startedAt, endedAt: now });
  const m = await ConnectMessage.create({ conversationId: done.conversationId, senderId: done.callerId, kind: 'system', text });
  await ConnectConversation.updateOne({ _id: done.conversationId }, { $set: { activityAt: m.createdAt, lastMessage: { id: m._id, text, senderId: m.senderId, at: m.createdAt } } });
  const callerName = await nameOf(done.callerId);
  const dto = toDto(done, conv, callerName);
  const msg = { id: String(m._id), conversationId: String(done.conversationId), senderId: String(done.callerId), kind: 'system', text, at: m.createdAt };
  membersOf(conv).forEach((u) => {
    push(u, { kind: 'call', event: 'ended', call: dto, reason: real });
    push(u, { kind: 'message', conversationId: String(done.conversationId), message: msg, from: { id: String(done.callerId), name: callerName } });
  });
  if (real === 'missed' || real === 'cancelled') {
    const answered = new Set([...done.participants.map((p) => String(p.userId)), ...done.declined.map(String)]);
    await notifyMany(done.invited.map(String).filter((u) => !answered.has(u)), {
      type: 'missed_call', title: `Missed ${done.mode} call from ${callerName}`, body: conv.type === 'group' ? conv.name || '' : '', link: '/connect/calls', conversationId: done.conversationId,
    });
  }
  return done;
}

/** Applies the rules that depend on time: nobody answered in time, or a joined person's browser vanished. */
async function settle(call, conv) {
  if (call.status === 'ended') return call;
  if (call.status === 'ringing' && isRingExpired(call.createdAt)) return (await finish(call, conv, 'missed')) || (await ConnectCall.findById(call._id));
  if (call.status === 'active') {
    const cutoff = Date.now() - STALE_MS;
    const gone = call.participants.filter((p) => p.state === 'joined' && new Date(p.lastSeenAt).getTime() < cutoff);
    if (gone.length) {
      await ConnectCall.updateOne({ _id: call._id }, { $set: { 'participants.$[g].state': 'left', 'participants.$[g].leftAt': new Date() } }, { arrayFilters: [{ 'g.userId': { $in: gone.map((g) => g.userId) }, 'g.state': 'joined' }] });
      const fresh = await ConnectCall.findById(call._id);
      return (await maybeEnd(fresh, conv)) || fresh;
    }
  }
  return call;
}

async function maybeEnd(call, conv) {
  if (!call || call.status === 'ended') return null;
  const joined = joinedOf(call);
  const callerJoined = joined.some((p) => String(p.userId) === String(call.callerId));
  if (shouldEnd({ status: call.status, joined: joined.length, callerJoined })) return finish(call, conv, call.status === 'ringing' ? 'cancelled' : 'completed');
  return null;
}

async function currentCall(conversationId) {
  return ConnectCall.findOne({ conversationId, status: { $in: LIVE } }).sort({ createdAt: -1 });
}

async function assertFree(me, exceptCallId) {
  const busy = await ConnectCall.findOne({ status: { $in: LIVE }, participants: { $elemMatch: { userId: oid(me), state: 'joined' } }, ...(exceptCallId ? { _id: { $ne: exceptCallId } } : {}) }).select('_id');
  if (busy) throw new ApiError(409, 'You are already on a call. Leave it first.', { code: 'ALREADY_ON_CALL' });
}

// ── API ─────────────────────────────────────────────────────────────

export async function startCall(me, conversationId, mode = 'voice') {
  ensureEnabled();
  const conv = await loadConversation(me, conversationId);
  await assertCanWrite(conv, me);
  let existing = await currentCall(conv._id);
  if (existing) existing = await settle(existing, conv);
  if (existing && existing.status !== 'ended') return { call: toDto(existing, conv, await nameOf(existing.callerId)), alreadyRunning: true };
  await assertFree(me);
  const others = membersOf(conv).filter((m) => m !== String(me));
  const call = await ConnectCall.create({
    conversationId: conv._id,
    callerId: oid(me),
    mode: mode === 'video' ? 'video' : 'voice',
    invited: others.map(oid),
    participants: [{ userId: oid(me), state: 'joined' }],
  });
  const callerName = await nameOf(me);
  const dto = toDto(call, conv, callerName);
  tell(conv, { kind: 'call', event: 'incoming', call: dto, from: { id: String(me), name: callerName } }, me);
  membersOf(conv).filter((m) => m !== String(me)).forEach((m) => pushToUser(m, { title: `${callerName} is calling`, body: call.mode === 'video' ? 'Incoming video call' : 'Incoming voice call', url: '/connect', tag: `call-${call._id}`, urgent: true }));
  // Stop ringing even if nobody's browser tells us (the 15 s sweep also covers a restart).
  setTimeout(() => ConnectCall.findById(call._id).then((c) => c && settle(c, conv)).catch(() => {}), RING_MS + 1000).unref?.();
  return { call: dto, alreadyRunning: false };
}

export async function conversationCall(me, conversationId) {
  const conv = await loadConversation(me, conversationId);
  let call = await currentCall(conv._id);
  if (call) call = await settle(call, conv);
  if (!call || call.status === 'ended') return { call: null, enabled: callsEnabled() };
  return { call: toDto(call, conv, await nameOf(call.callerId)), enabled: callsEnabled() };
}

/** For page loads and reconnects: a call that is ringing for me, or one I am still part of. */
export async function activeCalls(me) {
  const calls = await ConnectCall.find({ status: { $in: LIVE }, $or: [{ invited: oid(me) }, { 'participants.userId': oid(me) }] }).sort({ createdAt: -1 }).limit(5);
  let incoming = null;
  let ongoing = null;
  for (const raw of calls) {
    const conv = await ConnectConversation.findOne({ _id: raw.conversationId, members: oid(me) });
    if (!conv) continue;
    const call = await settle(raw, conv);
    if (call.status === 'ended') continue;
    const mine = call.participants.find((p) => String(p.userId) === String(me));
    const dto = toDto(call, conv, await nameOf(call.callerId));
    if (mine?.state === 'joined') ongoing ||= dto;
    else if (call.status === 'ringing' && !call.declined.map(String).includes(String(me))) incoming ||= dto;
  }
  return { incoming, ongoing, enabled: callsEnabled() };
}

export async function joinCall(me, callId) {
  ensureEnabled();
  const { call: found, conv } = await loadCallFor(me, callId);
  const call = await settle(found, conv);
  if (call.status === 'ended') throw new ApiError(409, 'This call has ended.', { code: 'CALL_ENDED' });
  await assertCanWrite(conv, me); // private chats: still friends
  await assertFree(me, call._id);
  const already = call.participants.find((p) => String(p.userId) === String(me));
  if (!(already && already.state === 'joined') && joinedOf(call).length >= MAX_ON_CALL) throw new ApiError(409, `A call can have up to ${MAX_ON_CALL} people.`, { code: 'CALL_FULL' });

  const now = new Date();
  if (already) {
    await ConnectCall.updateOne({ _id: call._id, 'participants.userId': oid(me) }, { $set: { 'participants.$.state': 'joined', 'participants.$.lastSeenAt': now }, $unset: { 'participants.$.leftAt': '' } });
  } else {
    await ConnectCall.updateOne({ _id: call._id, 'participants.userId': { $ne: oid(me) } }, { $push: { participants: { userId: oid(me), state: 'joined', joinedAt: now, lastSeenAt: now } } });
  }
  // The moment a second person is in, the call is active (and its length starts counting).
  const isCaller = String(call.callerId) === String(me);
  if (!isCaller && call.status === 'ringing') await ConnectCall.updateOne({ _id: call._id, status: 'ringing' }, { $set: { status: 'active', startedAt: now } });
  const fresh = await ConnectCall.findById(call._id);
  const name = await nameOf(me);
  const dto = toDto(fresh, conv, await nameOf(fresh.callerId));
  tell(conv, { kind: 'call', event: 'update', call: dto, from: { id: String(me), name } }, me);

  const identity = `u:${me}`;
  const token = mintMeetingRoomToken({ meetingId: `call-${call._id}`, identity, name, host: false });
  return {
    url: publicLivekitUrl(),
    token,
    room: roomNameFor(`call-${call._id}`),
    identity,
    isHost: false,
    title: dto.title,
    mode: fresh.mode,
    startedAt: fresh.startedAt || null,
    recording: false,
    recorder: null,
    canRecord: false,
    recordingStorage: false,
    hasAudio: false,
    call: dto,
    participant: { id: String(me), name, role: 'attendee', isGuest: false },
  };
}

export async function declineCall(me, callId) {
  const { call: found, conv } = await loadCallFor(me, callId);
  const call = await settle(found, conv);
  if (call.status !== 'ringing' || String(call.callerId) === String(me)) return { declined: false };
  const upd = await ConnectCall.findOneAndUpdate({ _id: call._id, status: 'ringing' }, { $addToSet: { declined: oid(me) } }, { new: true });
  if (!upd) return { declined: false };
  // Private chat: one "no" ends it. Group: it ends when everybody invited has said no and nobody joined.
  const nobodyJoinedExceptCaller = joinedOf(upd).every((p) => String(p.userId) === String(upd.callerId));
  if (conv.type !== 'group' || (nobodyJoinedExceptCaller && allDeclined(upd.invited, upd.declined))) await finish(upd, conv, 'declined');
  else tell(conv, { kind: 'call', event: 'update', call: toDto(upd, conv, await nameOf(upd.callerId)) }, me);
  return { declined: true };
}

export async function leaveCall(me, callId) {
  const { call: found, conv } = await loadCallFor(me, callId);
  if (found.status === 'ended') return { left: true };
  await ConnectCall.updateOne({ _id: found._id, 'participants.userId': oid(me) }, { $set: { 'participants.$.state': 'left', 'participants.$.leftAt': new Date() } });
  const call = await ConnectCall.findById(found._id);
  const ended = await maybeEnd(call, conv);
  if (!ended && call.status !== 'ended') tell(conv, { kind: 'call', event: 'update', call: toDto(call, conv, await nameOf(call.callerId)) }, me);
  return { left: true };
}

/** Heartbeat from the call screen. Replies in the shape the room page already understands: status "live" while the call runs. */
export async function pingCall(me, callId) {
  const { call: found, conv } = await loadCallFor(me, callId);
  const call = await settle(found, conv);
  if (call.status === 'ended') return { status: 'ended' };
  await ConnectCall.updateOne({ _id: call._id, participants: { $elemMatch: { userId: oid(me), state: 'joined' } } }, { $set: { 'participants.$.lastSeenAt': new Date() } });
  return { status: 'live', callStatus: call.status };
}

/** The Calls tab: my last 50 finished calls, newest first. */
export async function callHistory(me) {
  const calls = await ConnectCall.find({ status: 'ended', $or: [{ invited: oid(me) }, { callerId: oid(me) }] }).sort({ createdAt: -1 }).limit(50).lean();
  const convs = await ConnectConversation.find({ _id: { $in: calls.map((c) => c.conversationId) }, members: oid(me) }).select('type name members').lean();
  const byId = new Map(convs.map((c) => [String(c._id), c]));
  const otherIds = [...new Set(convs.filter((c) => c.type !== 'group').flatMap((c) => c.members.map(String).filter((m) => m !== String(me))))];
  const users = await User.find({ _id: { $in: otherIds.map(oid) } }).select('name').lean();
  const names = new Map(users.map((u) => [String(u._id), u.name]));
  return {
    items: calls.flatMap((c) => {
      const conv = byId.get(String(c.conversationId));
      if (!conv) return []; // not a member any more
      const group = conv.type === 'group';
      const other = group ? null : conv.members.map(String).find((m) => m !== String(me));
      const mine = String(c.callerId) === String(me);
      const answered = Boolean(c.startedAt);
      return [{
        id: String(c._id),
        conversationId: String(c.conversationId),
        name: group ? conv.name || 'Group' : names.get(other) || 'Someone',
        group,
        mode: c.mode,
        direction: mine ? 'outgoing' : 'incoming',
        outcome: answered ? 'completed' : c.endReason === 'declined' ? 'declined' : 'missed',
        durationMs: answered && c.endedAt ? new Date(c.endedAt) - new Date(c.startedAt) : 0,
        at: c.createdAt,
      }];
    }),
  };
}

/** Background clean-up (every 15 s): rings that nobody answered, and browsers that vanished mid-call. */
export async function sweepCalls() {
  const calls = await ConnectCall.find({ status: { $in: LIVE } }).limit(200);
  for (const call of calls) {
    const conv = await ConnectConversation.findById(call.conversationId);
    if (!conv) { await ConnectCall.updateOne({ _id: call._id }, { $set: { status: 'ended', endedAt: new Date(), endReason: 'missed' } }); continue; }
    await settle(call, conv).catch((err) => console.error('[calls] sweep failed:', err.message));
  }
}

let timer = null;
export function startCallSweeper() {
  if (timer) return;
  timer = setInterval(() => sweepCalls().catch(() => {}), 15_000);
  timer.unref?.();
}
export function stopCallSweeper() {
  clearInterval(timer);
  timer = null;
}
