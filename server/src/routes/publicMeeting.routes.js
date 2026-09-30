import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as meetingController from '../controllers/meeting.controller.js';

/**
 * Public, unauthenticated, read-only view of a meeting the organizer explicitly shared.
 * The token is 192 bits of randomness, only its SHA-256 hash is stored, it expires, and it
 * can be revoked. Audio is never exposed here.
 */
const router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later', code: 'RATE_LIMITED' },
});

router.get('/meetings/:token', limiter, meetingController.publicMeeting);

export default router;
