import { Router } from 'express';
import { z } from 'zod';
import * as scheduleController from '../controllers/schedule.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/requireTenant.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateRequest } from '../middleware/validateRequest.js';

const router = Router();

const blockSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.enum(['work', 'study', 'meeting', 'exercise', 'personal', 'other']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startMin: z.coerce.number().int().min(0).max(1439),
  endMin: z.coerce.number().int().min(1).max(1440),
  notes: z.string().optional(),
  allowOverlap: z.boolean().optional(),
});

const blockPatchSchema = blockSchema.partial();

const listQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMin: z.string().regex(/^\d+$/),
});

router.use(authenticate, requireTenant);

router.get('/', requirePermission('schedule.view'), validateRequest(listQuerySchema, 'query'), scheduleController.listBlocks);
router.get('/availability', requirePermission('schedule.view'), validateRequest(availabilityQuerySchema, 'query'), scheduleController.getAvailability);

router.post('/', requirePermission('schedule.create'), validateRequest(blockSchema), scheduleController.createBlock);
router.patch('/:id', requirePermission('schedule.edit'), validateRequest(blockPatchSchema), scheduleController.updateBlock);
router.delete('/:id', requirePermission('schedule.delete'), scheduleController.deleteBlock);

export default router;
