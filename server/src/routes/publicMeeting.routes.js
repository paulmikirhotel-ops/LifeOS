import express, { Router } from 'express';
import { env } from '../config/env.js';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as meetingController from '../controllers/meeting.controller.js';
import { optionalAuthenticate } from '../middleware/optionalAuthenticate.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { INVITE_PASSWORD_MAX } from '../utils/invite.js';

/**
 * Public, unauthenticated endpoints.
 *
 *  /public/meetings/:token   read-only view of a COMPLETED meeting the organizer explicitly shared
 *  /public/meet/:token/...   join flow for a meeting invitation link (password protected)
 *
 * Tokens are 192–256 bits of randomness, only hashes are stored, and each can be revoked/regenerated.
 * Audio is never exposed here.
 */
const router = Router();

const limited = (limit, message) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message, code: 'RATE_LIMITED' },
  });

const limiter = limited(60, 'Too many requests, please try again later');
const inviteViewLimiter = limited(120, 'Too many requests, please try again later');
// Password attempts are the sensitive call: tight per-IP ceiling here, plus a per-meeting lockout in the service.
const joinLimiter = limited(20, 'Too many attempts, please try again in a few minutes');

const joinSchema = z.object({
  password: z.string().max(INVITE_PASSWORD_MAX).optional(),
  name: z.string().max(120).optional(),
  email: z.string().max(254).optional(),
});

router.get('/meetings/:token', limiter, meetingController.publicMeeting);

router.get('/meet/:token', inviteViewLimiter, optionalAuthenticate, meetingController.inviteInfo);
router.get('/meet/:token/minutes', inviteViewLimiter, meetingController.inviteMinutes);
// Personal key from the "minutes ready" e-mail (works after the meeting, no pass or login needed).
router.get('/minutes/:key', inviteViewLimiter, meetingController.minutesByKey);
router.get('/meet/:token/session', inviteViewLimiter, meetingController.inviteSession);

// Video room for link joiners. Authorised by the meeting pass (X-Meeting-Pass header), never by the URL.
// Limits are keyed per pass, not per IP, so a whole office or mobile carrier sharing one IP is not throttled together.
const perPass = (limit, windowMs, message) =>
  rateLimit({
    windowMs,
    limit,
    keyGenerator: (req) => `p:${String(req.get('x-meeting-pass') || 'none').slice(-40)}`,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: { keyGeneratorIpFallback: false },
    message: { success: false, message, code: 'RATE_LIMITED' },
  });
const roomJoinLimiter = perPass(30, 15 * 60 * 1000, 'Too many join attempts, please try again in a few minutes');
// The room pings every ~20 s and a recorder also sends a heartbeat: generous per-pass ceilings, still bounded.
const roomPingLimiter = perPass(200, 15 * 60 * 1000, 'Too many room updates');
const recordingLimiter = perPass(120, 15 * 60 * 1000, 'Too many recording requests');
const chunkLimiter = perPass(500, 15 * 60 * 1000, 'Uploading audio too quickly');
const rawAudio = express.raw({ type: () => true, limit: env.meetings.chunkMaxBytes });
const chatLimiter = perPass(900, 15 * 60 * 1000, 'Chat is going too fast');
const chatBody = z.object({ text: z.string().max(4000) });
const beatBody = z.object({ paused: z.boolean().optional() });
const chunkParams = z.object({ token: z.string().max(80), index: z.coerce.number().int().min(0).max(99999) });
router.post('/meet/:token/room', roomJoinLimiter, meetingController.inviteRoomJoin);
router.post('/meet/:token/room/ping', roomPingLimiter, meetingController.inviteRoomPing);
router.post('/meet/:token/recording/claim', recordingLimiter, meetingController.inviteRecordingClaim);
router.post('/meet/:token/recording/release', recordingLimiter, meetingController.inviteRecordingRelease);
router.post('/meet/:token/recording/beat', chunkLimiter, validateRequest(beatBody), meetingController.inviteRecordingBeat);
router.put('/meet/:token/recording/chunks/:index', chunkLimiter, validateRequest(chunkParams, 'params'), rawAudio, meetingController.inviteRecordingChunk);
router.get('/meet/:token/chat', chatLimiter, meetingController.inviteChatList);
router.post('/meet/:token/chat', chatLimiter, validateRequest(chatBody), meetingController.inviteChatSend);
router.post('/meet/:token/room/leave', roomJoinLimiter, meetingController.inviteRoomLeave);
router.post('/meet/:token/join', joinLimiter, optionalAuthenticate, validateRequest(joinSchema), meetingController.inviteJoin);

export default router;
