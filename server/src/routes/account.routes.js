import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as ctrl from '../controllers/account.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateRequest } from '../middleware/validateRequest.js';

const router = Router();

const perUser = (windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit,
    keyGenerator: (req) => `u:${req.user?.id || 'anon'}`,
    validate: { keyGeneratorIpFallback: false },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message, code: 'RATE_LIMITED' },
  });
// Sensitive actions are slow-guarded so a stolen session cannot guess the password here.
const sensitive = perUser(15 * 60 * 1000, 10, 'Too many attempts, please wait a few minutes');
const exportLimit = perUser(60 * 60 * 1000, 5, 'You can export your data 5 times per hour');
const publicLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, message: 'Too many attempts, please wait a few minutes', code: 'RATE_LIMITED' } });

const emailChangeSchema = z.object({ password: z.string().min(1).max(100), newEmail: z.string().min(3).max(254) });
const deleteSchema = z.object({ password: z.string().min(1).max(100), confirm: z.literal('DELETE') });
const tokenSchema = z.object({ token: z.string().min(10) });

router.get('/export', authenticate, exportLimit, ctrl.exportMine);
router.post('/sign-out-everywhere', authenticate, sensitive, ctrl.signOutEverywhere);
router.post('/change-email', authenticate, sensitive, validateRequest(emailChangeSchema), ctrl.changeEmail);
router.post('/confirm-email-change', publicLimit, validateRequest(tokenSchema), ctrl.confirmEmail);
router.post('/delete', authenticate, sensitive, validateRequest(deleteSchema), ctrl.deleteMine);

export default router;
