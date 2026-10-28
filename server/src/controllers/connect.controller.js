import * as connect from '../services/connect.service.js';
import * as resources from '../services/connectResources.service.js';
import * as notes from '../services/connectNotify.service.js';
import * as safety from '../services/connectSafety.service.js';
import * as extras from '../services/connectExtras.service.js';
import * as calls from '../services/connectCall.service.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const summary = async (req, res) => ok(res, { ...(await connect.summary(req.user.id)), callsEnabled: calls.callsEnabled() });
export const searchUsers = async (req, res) => ok(res, await connect.searchUsers(req.user.id, req.query.q));
export const listFriends = async (req, res) => ok(res, await connect.listFriends(req.user.id));
export const sendRequest = async (req, res) => ok(res, await connect.sendRequest(req.user.id, req.body.userId), 201);
export const acceptRequest = async (req, res) => ok(res, await connect.acceptRequest(req.user.id, req.params.id));
export const declineRequest = async (req, res) => ok(res, await connect.declineRequest(req.user.id, req.params.id));
export const removeFriend = async (req, res) => ok(res, await connect.removeFriend(req.user.id, req.params.userId));
export const listConversations = async (req, res) => ok(res, await connect.listConversations(req.user.id));
export const openConversation = async (req, res) => ok(res, await connect.openConversation(req.user.id, req.body.userId), 201);
export const listMessages = async (req, res) => ok(res, await connect.listMessages(req.user.id, req.params.id, req.query));
export const sendMessage = async (req, res) => ok(res, await connect.sendMessage(req.user.id, req.params.id, req.body), 201);
export const editMessage = async (req, res) => ok(res, await connect.editMessage(req.user.id, req.params.id, req.body.text));
export const deleteMessage = async (req, res) => ok(res, await connect.deleteMessage(req.user.id, req.params.id));
export const markRead = async (req, res) => ok(res, await connect.markRead(req.user.id, req.params.id));
export const markDelivered = async (req, res) => ok(res, await connect.markDelivered(req.user.id, req.params.id));
export const typing = async (req, res) => ok(res, await connect.typing(req.user.id, req.params.id));

// ── groups ──
export const createGroup = async (req, res) => ok(res, await connect.createGroup(req.user.id, req.body), 201);
export const updateGroup = async (req, res) => ok(res, await connect.updateGroup(req.user.id, req.params.id, req.body));
export const addMembers = async (req, res) => ok(res, await connect.addMembers(req.user.id, req.params.id, req.body.userIds));
export const removeMember = async (req, res) => ok(res, await connect.removeMember(req.user.id, req.params.id, req.params.userId));
export const setAdmin = async (req, res) => ok(res, await connect.setAdmin(req.user.id, req.params.id, req.params.userId, req.method === 'PUT'));

// ── files and contact cards ──
export const sendAttachment = async (req, res) =>
  ok(res, await connect.sendAttachment(req.user.id, req.params.id, req.file, { caption: req.body?.caption, replyToId: req.body?.replyToId, voice: req.body?.voice === '1' }), 201);
export const sendContact = async (req, res) => ok(res, await connect.sendContact(req.user.id, req.params.id, req.body.userId, req.body.replyToId), 201);
export const sharedFiles = async (req, res) => ok(res, await connect.listSharedFiles(req.user.id, req.query));

/** Streams a stored file to a member of its conversation (supports Range so videos can seek). */
export async function downloadAttachment(req, res) {
  const f = await connect.openAttachment(req.user.id, req.params.id, req.headers.range);
  const asciiName = f.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  res.status(f.contentRange ? 206 : 200);
  res.set({
    'Content-Type': f.mime, // from our own table, never what the uploader claimed
    'Content-Length': String(f.size),
    'Content-Disposition': `${f.inline ? 'inline' : 'attachment'}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'",
    'Cache-Control': 'private, max-age=3600',
    'Accept-Ranges': 'bytes',
    ...(f.contentRange ? { 'Content-Range': f.contentRange } : {}),
  });
  f.stream.on('error', () => res.destroy());
  f.stream.pipe(res);
}

// ── LifeOS items shared in chats ──
export const shareOptions = async (req, res) => ok(res, await resources.shareOptions(req.user.id, req.query.type, req.query.q));
export const shareResource = async (req, res) => ok(res, await resources.shareResource(req.user.id, req.params.id, req.body), 201);
export const getResource = async (req, res) => ok(res, await resources.getResource(req.user.id, req.params.id));
export const addResource = async (req, res) => ok(res, await resources.addResource(req.user.id, req.params.id), 201);

// ── calls ──
export const startCall = async (req, res) => ok(res, await calls.startCall(req.user.id, req.params.id, req.body.mode), 201);
export const conversationCall = async (req, res) => ok(res, await calls.conversationCall(req.user.id, req.params.id));
export const activeCalls = async (req, res) => ok(res, await calls.activeCalls(req.user.id));
export const joinCall = async (req, res) => ok(res, await calls.joinCall(req.user.id, req.params.id));
export const declineCall = async (req, res) => ok(res, await calls.declineCall(req.user.id, req.params.id));
export const leaveCall = async (req, res) => ok(res, await calls.leaveCall(req.user.id, req.params.id));
export const pingCall = async (req, res) => ok(res, await calls.pingCall(req.user.id, req.params.id));
export const callHistory = async (req, res) => ok(res, await calls.callHistory(req.user.id));

// ── notifications ──
export const listNotifications = async (req, res) => ok(res, await notes.listNotifications(req.user.id));
export const readNotifications = async (req, res) => ok(res, await notes.markNotificationsRead(req.user.id, req.body.ids));

// ── safety and privacy ──
export const listBlocked = async (req, res) => ok(res, await safety.listBlocked(req.user.id));
export const blockUser = async (req, res) => ok(res, await safety.blockUser(req.user.id, req.body.userId), 201);
export const unblockUser = async (req, res) => ok(res, await safety.unblockUser(req.user.id, req.params.userId));
export const reportUser = async (req, res) => ok(res, await safety.reportUser(req.user.id, req.body), 201);
export const getPrivacy = async (req, res) => ok(res, await safety.getPrivacy(req.user.id));
export const setPrivacy = async (req, res) => ok(res, await safety.setPrivacy(req.user.id, req.body));

// ── reactions, forward, mute/archive, search ──
export const react = async (req, res) => ok(res, await extras.react(req.user.id, req.params.id, req.body.emoji ?? null));
export const forwardMessage = async (req, res) => ok(res, await extras.forwardMessage(req.user.id, req.params.id, req.body.conversationIds), 201);
export const setPrefs = async (req, res) => ok(res, await extras.setPrefs(req.user.id, req.params.id, req.body));
export const searchMessages = async (req, res) => ok(res, await extras.searchMessages(req.user.id, req.params.id, req.query.q));

export const setGroupAvatar = async (req, res) => ok(res, await extras.setGroupAvatar(req.user.id, req.params.id, req.file));
export const removeGroupAvatar = async (req, res) => ok(res, await extras.removeGroupAvatar(req.user.id, req.params.id));
export const groupAvatar = async (req, res) => {
  const f = await extras.openGroupAvatar(req.user.id, req.params.id);
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Content-Length', String(f.size));
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
  f.stream.on('error', () => res.destroy());
  f.stream.pipe(res);
};
