import { Router } from 'express';
import { z } from 'zod';
import * as timeController from '../controllers/time.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/requireTenant.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { flexDate, optDate } from '../utils/flex.js';

const router = Router();

const entrySchema = z.object({
  activityType: z.enum(['work', 'study', 'meeting', 'personal', 'other']).optional(),
  description: z.string().optional(),
  taskId: z.string().optional(),
  startedAt: flexDate,
  endedAt: optDate,
});

const patchSchema = z.object({
  activityType: z.enum(['work', 'study', 'meeting', 'personal', 'other']).optional(),
  description: z.string().optional(),
  endedAt: optDate,
});

router.get('/', authenticate, requireTenant, timeController.listEntries);
router.post('/', authenticate, requireTenant, validateRequest(entrySchema), timeController.createEntry);
router.get('/summary', authenticate, requireTenant, timeController.getSummary);
router.patch('/:id', authenticate, requireTenant, validateRequest(patchSchema), timeController.updateEntry);
router.delete('/:id', authenticate, requireTenant, timeController.removeEntry);

export default router;
