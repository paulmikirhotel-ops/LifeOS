import { Router } from 'express';
import { z } from 'zod';
import * as focusController from '../controllers/focus.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/requireTenant.js';
import { validateRequest } from '../middleware/validateRequest.js';

const router = Router();

const startSchema = z.object({
  plannedMinutes: z.coerce.number().int().min(1).max(180),
  type: z.enum(['focus', 'short_break', 'long_break']).optional(),
  taskId: z.string().optional(),
});

const actionSchema = z.object({
  action: z.enum(['pause', 'resume', 'complete', 'abandon']),
});

router.get('/sessions', authenticate, requireTenant, focusController.listSessions);
router.get('/sessions/summary', authenticate, requireTenant, focusController.getSummary);
router.post('/sessions', authenticate, requireTenant, validateRequest(startSchema), focusController.startSession);
router.patch('/sessions/:id', authenticate, requireTenant, validateRequest(actionSchema), focusController.performAction);

export default router;
