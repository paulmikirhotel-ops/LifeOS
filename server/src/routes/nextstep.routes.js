import { Router } from 'express';
import { z } from 'zod';
import * as c from '../controllers/nextstep.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/requireTenant.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { optDate, clearableDate } from '../utils/flex.js';

/**
 * NextStep: AI roadmap for one goal. Everything is scoped to the signed-in user inside the active workspace.
 * Reads need goals.view, writes need goals.create. Approving also checks tasks.create / schedule.create in the service.
 */
const router = Router();
router.use(authenticate, requireTenant);

const priority = z.enum(['urgent', 'high', 'medium', 'low']);

const createSchema = z.object({
  goalText: z.string().trim().min(8).max(1000),
  hoursPerWeek: z.coerce.number().min(1).max(60).optional(),
  targetDate: optDate,
});
const planPatch = z.object({ title: z.string().trim().min(1).max(120).optional(), targetDate: clearableDate });
const reviseSchema = z.object({ instruction: z.string().trim().min(4).max(500) });
const itemPatch = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  kind: z.enum(['task', 'event']).optional(),
  priority: priority.optional(),
  estimatedMinutes: z.coerce.number().min(10).max(600).optional(),
  dueDate: optDate,
  approved: z.boolean().optional(),
});
const itemAdd = itemPatch.extend({ phaseId: z.string().length(24), title: z.string().trim().min(1).max(140) });
const markSchema = z.object({ action: z.enum(['done', 'later']) });

router.get('/', requirePermission('goals.view'), c.list);
router.get('/next', requirePermission('goals.view'), c.next);
router.get('/plans/:id', requirePermission('goals.view'), c.get);

router.post('/plans', requirePermission('goals.create'), validateRequest(createSchema), c.create);
router.patch('/plans/:id', requirePermission('goals.create'), validateRequest(planPatch), c.update);
router.delete('/plans/:id', requirePermission('goals.create'), c.archive);
router.post('/plans/:id/revise', requirePermission('goals.create'), validateRequest(reviseSchema), c.revise);
router.post('/plans/:id/approve', requirePermission('goals.create'), c.approve);
router.post('/plans/:id/items', requirePermission('goals.create'), validateRequest(itemAdd), c.addItem);
router.patch('/plans/:id/items/:itemId', requirePermission('goals.create'), validateRequest(itemPatch), c.patchItem);
router.delete('/plans/:id/items/:itemId', requirePermission('goals.create'), c.removeItem);
router.post('/plans/:id/items/:itemId/mark', requirePermission('goals.create'), validateRequest(markSchema), c.markItem);

export default router;
