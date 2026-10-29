import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as c from '../controllers/deviceLink.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { statusSchema, codeSchema, pairSchema, targetSchema, idParamSchema } from '../utils/deviceLink.logic.js';

/**
 * /api/auth/link/...   Sign in with QR, and the list of devices signed in as me.
 * Mounted BEFORE /api/auth on purpose: the computer asks "was it approved?" every 2 seconds, which would
 * quickly use up the strict limit that /api/auth has for passwords.
 */
const router = Router();

// The computer's page is not signed in yet, so these two are limited by address.
router.post('/start', rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many codes. Please wait a minute.' } }), c.start);
router.post('/status', rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many checks. Please wait a moment.' } }), validateRequest(statusSchema), c.status);

// Everything below needs a signed-in person, and is limited per person (never by address).
router.use(authenticate);
router.use(rateLimit({
  windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `link:${req.user.id}`,
  message: { success: false, message: 'Too many tries. Please wait a moment.' },
}));
const typing = rateLimit({
  windowMs: 60_000, limit: 8, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `linkpair:${req.user.id}`, // guessing a pair code is slowed down much more
  message: { success: false, message: 'Too many tries. Please wait a minute.' },
});

router.post('/peek', validateRequest(codeSchema), c.peek);
router.post('/lookup', typing, validateRequest(pairSchema), c.lookup);
router.post('/approve', validateRequest(targetSchema), c.approve);
router.post('/deny', validateRequest(targetSchema), c.deny);
router.get('/devices', c.devices);
router.delete('/devices/:id', validateRequest(idParamSchema, 'params'), c.removeOne);

export default router;
