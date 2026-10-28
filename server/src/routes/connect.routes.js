import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as c from '../controllers/connect.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { MAX_UPLOAD_BYTES } from '../services/connect.service.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * LifeOS Connect API. Signed-in users only. It is per person, so there is no workspace check here;
 * the service checks friendship / conversation membership on every call.
 */
const router = Router();
router.use(authenticate);

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const idParam = z.object({ id: objectId });
const userParam = z.object({ userId: objectId });

const perUser = (limit, message) =>
  rateLimit({
    windowMs: 60 * 1000,
    limit,
    keyGenerator: (req) => `u:${req.user?.id || 'anon'}`,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: { keyGeneratorIpFallback: false },
    message: { success: false, message, code: 'RATE_LIMITED' },
  });
const general = perUser(300, 'Too many requests, slow down');
const searchLimiter = perUser(30, 'Searching too fast');
const requestLimiter = perUser(20, 'Too many friend requests');
const sendLimiter = perUser(90, 'Sending too fast');
const typingLimiter = perUser(60, 'Too many typing signals');
router.use(general);

const searchQuery = z.object({ q: z.string().max(80) });
const userBody = z.object({ userId: objectId });
const sendBody = z.object({ text: z.string().max(8000), replyToId: objectId.optional(), mentions: z.array(objectId).max(10).optional() });
const editBody = z.object({ text: z.string().max(8000) });
const listQuery = z.object({ before: objectId.optional(), limit: z.coerce.number().int().min(1).max(100).optional() });

const uploadLimiter = perUser(20, 'Sending files too fast');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 } }).single('file');
// Turns multer's own errors into friendly ones (e.g. "File too large").
const takeFile = (req, res, next) => upload(req, res, (err) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') return next(new ApiError(413, `Files can be up to ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB.`, { code: 'PAYLOAD_TOO_LARGE' }));
  return next(ApiError.badRequest('The file could not be read.'));
});

const groupBody = z.object({ name: z.string().min(1).max(100), description: z.string().max(400).optional(), memberIds: z.array(objectId).min(1).max(99) });
const groupPatch = z.object({ name: z.string().min(1).max(100).optional(), description: z.string().max(400).optional() });
const membersBody = z.object({ userIds: z.array(objectId).min(1).max(99) });
const groupUserParams = z.object({ id: objectId, userId: objectId });
const contactBody = z.object({ userId: objectId, replyToId: objectId.optional() });
const filesQuery = z.object({ type: z.enum(['media', 'docs']).optional(), before: objectId.optional(), conversationId: objectId.optional(), limit: z.coerce.number().int().min(1).max(60).optional() });

const resourceBody = z.object({ type: z.enum(['task', 'goal', 'event', 'meeting', 'note']), id: objectId, password: z.string().max(64).optional(), includePassword: z.boolean().optional(), replyToId: objectId.optional() });
const optionsQuery = z.object({ type: z.enum(['task', 'goal', 'event', 'meeting', 'note']), q: z.string().max(60).optional() });

const callLimiter = perUser(10, 'Starting calls too fast');
const callBody = z.object({ mode: z.enum(['voice', 'video']).optional() });

router.get('/summary', c.summary);
router.get('/users/search', searchLimiter, validateRequest(searchQuery, 'query'), c.searchUsers);

router.get('/friends', c.listFriends);
router.post('/friends/requests', requestLimiter, validateRequest(userBody), c.sendRequest);
router.post('/friends/requests/:id/accept', validateRequest(idParam, 'params'), c.acceptRequest);
router.post('/friends/requests/:id/decline', validateRequest(idParam, 'params'), c.declineRequest);
router.delete('/friends/:userId', validateRequest(userParam, 'params'), c.removeFriend);

router.get('/conversations', c.listConversations);
router.post('/conversations', validateRequest(userBody), c.openConversation);
router.get('/conversations/:id/messages', validateRequest(idParam, 'params'), validateRequest(listQuery, 'query'), c.listMessages);
router.post('/conversations/:id/messages', sendLimiter, validateRequest(idParam, 'params'), validateRequest(sendBody), c.sendMessage);
router.post('/conversations/:id/read', validateRequest(idParam, 'params'), c.markRead);
router.post('/conversations/:id/delivered', validateRequest(idParam, 'params'), c.markDelivered);
router.post('/conversations/:id/typing', typingLimiter, validateRequest(idParam, 'params'), c.typing);

router.post('/groups', requestLimiter, validateRequest(groupBody), c.createGroup);
router.patch('/groups/:id', validateRequest(idParam, 'params'), validateRequest(groupPatch), c.updateGroup);
router.post('/groups/:id/members', requestLimiter, validateRequest(idParam, 'params'), validateRequest(membersBody), c.addMembers);
router.delete('/groups/:id/members/:userId', validateRequest(groupUserParams, 'params'), c.removeMember);
router.put('/groups/:id/admins/:userId', validateRequest(groupUserParams, 'params'), c.setAdmin);
router.delete('/groups/:id/admins/:userId', validateRequest(groupUserParams, 'params'), c.setAdmin);

router.post('/conversations/:id/attachments', uploadLimiter, validateRequest(idParam, 'params'), takeFile, c.sendAttachment);
router.post('/conversations/:id/contact', sendLimiter, validateRequest(idParam, 'params'), validateRequest(contactBody), c.sendContact);
router.get('/attachments/:id', validateRequest(idParam, 'params'), c.downloadAttachment);
router.get('/files', validateRequest(filesQuery, 'query'), c.sharedFiles);

router.get('/share/options', validateRequest(optionsQuery, 'query'), c.shareOptions);
router.post('/conversations/:id/resource', sendLimiter, validateRequest(idParam, 'params'), validateRequest(resourceBody), c.shareResource);
router.get('/resources/:id', validateRequest(idParam, 'params'), c.getResource);
router.post('/resources/:id/add', requestLimiter, validateRequest(idParam, 'params'), c.addResource);

router.patch('/messages/:id', sendLimiter, validateRequest(idParam, 'params'), validateRequest(editBody), c.editMessage);
router.delete('/messages/:id', validateRequest(idParam, 'params'), c.deleteMessage);

router.get('/notifications', c.listNotifications);
router.post('/notifications/read', validateRequest(z.object({ ids: z.array(objectId).max(100).optional() })), c.readNotifications);

const reportLimiter = perUser(5, 'Sending reports too fast');
const reportBody = z.object({ userId: objectId, messageId: objectId.optional(), reason: z.enum(['spam', 'harassment', 'inappropriate', 'impersonation', 'other']), details: z.string().max(500).optional() });
router.get('/blocks', c.listBlocked);
router.post('/blocks', requestLimiter, validateRequest(userBody), c.blockUser);
router.delete('/blocks/:userId', validateRequest(userParam, 'params'), c.unblockUser);
router.post('/reports', reportLimiter, validateRequest(reportBody), c.reportUser);
router.get('/privacy', c.getPrivacy);
router.put('/privacy', validateRequest(z.object({ discoverable: z.boolean() })), c.setPrivacy);

router.put('/messages/:id/reaction', sendLimiter, validateRequest(idParam, 'params'), validateRequest(z.object({ emoji: z.string().max(8).nullable().optional() })), c.react);
router.post('/messages/:id/forward', sendLimiter, validateRequest(idParam, 'params'), validateRequest(z.object({ conversationIds: z.array(objectId).min(1).max(5) })), c.forwardMessage);
router.put('/conversations/:id/prefs', validateRequest(idParam, 'params'), validateRequest(z.object({ muted: z.boolean().optional(), archived: z.boolean().optional() })), c.setPrefs);
router.get('/conversations/:id/search', searchLimiter, validateRequest(idParam, 'params'), validateRequest(z.object({ q: z.string().max(80) }), 'query'), c.searchMessages);

router.put('/groups/:id/avatar', uploadLimiter, validateRequest(idParam, 'params'), takeFile, c.setGroupAvatar);
router.delete('/groups/:id/avatar', validateRequest(idParam, 'params'), c.removeGroupAvatar);
router.get('/groups/:id/avatar', validateRequest(idParam, 'params'), c.groupAvatar);

// Calls (voice / video on the LiveKit rooms)
router.post('/conversations/:id/call', callLimiter, validateRequest(idParam, 'params'), validateRequest(callBody), c.startCall);
router.get('/conversations/:id/call', validateRequest(idParam, 'params'), c.conversationCall);
router.get('/calls/active', c.activeCalls);
router.get('/calls/history', c.callHistory);
router.post('/calls/:id/join', validateRequest(idParam, 'params'), c.joinCall);
router.post('/calls/:id/decline', validateRequest(idParam, 'params'), c.declineCall);
router.post('/calls/:id/leave', validateRequest(idParam, 'params'), c.leaveCall);
router.post('/calls/:id/ping', validateRequest(idParam, 'params'), c.pingCall);

export default router;
