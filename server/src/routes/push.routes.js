import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as ctrl from '../controllers/push.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateRequest } from '../middleware/validateRequest.js';

const router = Router();
const perUser = (windowMs, limit) =>
  rateLimit({
    windowMs,
    limit,
    keyGenerator: (req) => `u:${req.user?.id || 'anon'}`,
    validate: { keyGeneratorIpFallback: false },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please wait a moment', code: 'RATE_LIMITED' },
  });

const subSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(1000),
    keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(5).max(100) }),
  }),
});
const unsubSchema = z.object({ endpoint: z.string().max(1000).optional() });

router.get('/config', authenticate, ctrl.config);
router.post('/subscribe', authenticate, perUser(10 * 60 * 1000, 30), validateRequest(subSchema), ctrl.subscribe);
router.post('/unsubscribe', authenticate, perUser(10 * 60 * 1000, 30), validateRequest(unsubSchema), ctrl.unsubscribe);
router.post('/test', authenticate, perUser(10 * 60 * 1000, 5), ctrl.test);

export default router;
