import { Router } from 'express';
import { z } from 'zod';
import * as briefingController from '../controllers/briefing.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/requireTenant.js';
import { validateRequest } from '../middleware/validateRequest.js';

/**
 * Today page: morning briefing, evening review, weekly report.
 * Every section is permission-aware inside the service (a member without finance.view never
 * receives money figures, and so on), so these routes only need a signed-in workspace member.
 */
const router = Router();

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

const reviewSchema = z.object({
  wentWell: z.string().max(2000).optional(),
  improve: z.string().max(2000).optional(),
  mood: z.enum(['great', 'good', 'ok', 'low', 'bad']).optional(),
  taskActions: z
    .array(z.object({ taskId: objectId, action: z.enum(['tomorrow', 'drop']) }))
    .max(20)
    .optional(),
});

const weekQuery = z.object({ week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional() });
const prefsSchema = z
  .object({ aiInsights: z.boolean().optional(), weeklyDigest: z.boolean().optional() })
  .refine((v) => v.aiInsights !== undefined || v.weeklyDigest !== undefined, 'Nothing to change');
const unsubQuery = z.object({ u: z.string().optional(), t: z.string().optional() });

// Public: the unsubscribe link in the weekly email (signed token, no login).
router.get('/unsubscribe', validateRequest(unsubQuery, 'query'), briefingController.unsubscribe);

router.use(authenticate, requireTenant);

router.get('/morning', briefingController.morning);
router.get('/evening', briefingController.evening);
router.post('/evening/review', validateRequest(reviewSchema), briefingController.saveReview);
router.get('/weekly', validateRequest(weekQuery, 'query'), briefingController.weekly);
router.get('/weekly/history', briefingController.weeklyHistory);
router.get('/preferences', briefingController.getPreferences);
router.patch('/preferences', validateRequest(prefsSchema), briefingController.setPreferences);

export default router;
