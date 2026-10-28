import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as meetingController from '../controllers/meeting.controller.js';
import * as inviteController from '../controllers/meetingInvite.controller.js';
import { optionalAuth } from '../middleware/optionalAuth.js';
import { validateRequest } from '../middleware/validateRequest.js';

/**
 * Public, unauthenticated surface for meeting links.
 *
 * Two different things live here and they are deliberately separate:
 *
 *   1. `/meetings/:token` — the POST-MEETING read-only share (summary, minutes,
 *      action items). The token is 192 bits of randomness, only its hash is
 *      stored, it expires, it can be revoked, and audio is NEVER exposed.
 *
 *   2. `/invite/:code/...` — the PRE-MEETING invitation link (`/meet/<code>`).
 *      Its access rules are per meeting (public / authenticated / restricted,
 *      guests, approval). It exists so an organizer can drop one link into a
 *      WhatsApp group instead of typing every participant in.
 *
 * `optionalAuth` is used instead of `authenticate` so a signed-in visitor is
 * recognised (and can join as themselves) while a signed-out visitor is not
 * bounced to a login wall before they can even see the invitation.
 */
const router = Router();

/** Link views are cheap but enumerable, so they get a real ceiling. */
const viewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later', code: 'RATE_LIMITED' },
});

/** Joins write a roster row, so they are capped much harder than views. */
const joinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many join attempts, please try again shortly', code: 'RATE_LIMITED' },
});

const codeParam = z.object({
  // 72 bits of base64url; the bound keeps junk from reaching the database.
  code: z.string().min(8).max(40).regex(/^[A-Za-z0-9_-]+$/, 'Invalid link'),
});

const joinBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(254).optional(),
  requestOnly: z.boolean().optional(),
  // Accepted in the body as well as the header so the page can join with a plain
  // form post and no custom headers (e.g. from a restricted webview).
  guestKey: z.string().min(16).max(200).optional(),
});

// ── post-meeting share token (existing behaviour, unchanged) ────────────
router.get('/meetings/:token', viewLimiter, meetingController.publicMeeting);

// ── pre-meeting invitation link ─────────────────────────────────────────
router.get('/invite/:code', viewLimiter, optionalAuth, validateRequest(codeParam, 'params'), inviteController.invitation);
router.post(
  '/invite/:code/join',
  joinLimiter,
  optionalAuth,
  validateRequest(codeParam, 'params'),
  validateRequest(joinBody),
  inviteController.join
);
router.post(
  '/invite/:code/calendar',
  joinLimiter,
  optionalAuth,
  validateRequest(codeParam, 'params'),
  inviteController.addToCalendar
);
// Responding (accept / decline) is intentionally NOT a public route. To record a
// response we must know WHO is responding, and the only trustworthy identity on a
// public URL is an authenticated session — so that lives on the authenticated
// router as POST /meetings/:id/respond and is driven by the in-app Invitations view.

export default router;
