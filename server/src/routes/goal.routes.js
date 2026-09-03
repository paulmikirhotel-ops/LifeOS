import { Router } from 'express';
import { z } from 'zod';
import * as goalController from '../controllers/goal.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/requireTenant.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { optDate } from '../utils/flex.js';

const router = Router();

const goalSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['short_term', 'long_term']).optional(),
  targetDate: optDate,
  milestones: z
    .array(
      z.object({
        title: z.string().min(1),
        isDone: z.boolean().optional(),
        dueDate: optDate,
      })
    )
    .max(50)
    .optional(),
  relatedTaskIds: z.array(z.string()).optional(),
});

const patchSchema = goalSchema.partial().extend({
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
  progress: z.coerce.number().min(0).max(100).optional(),
});

router.get('/', authenticate, requireTenant, requirePermission('goals.view'), goalController.listGoals);
router.post('/', authenticate, requireTenant, requirePermission('goals.create'), validateRequest(goalSchema), goalController.createGoal);
router.patch('/:id', authenticate, requireTenant, requirePermission('goals.edit'), validateRequest(patchSchema), goalController.updateGoal);
router.delete('/:id', authenticate, requireTenant, requirePermission('goals.delete'), goalController.removeGoal);

export default router;
