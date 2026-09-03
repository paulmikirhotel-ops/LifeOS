import { Router } from 'express';
import { z } from 'zod';
import * as habitController from '../controllers/habit.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/requireTenant.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateRequest } from '../middleware/validateRequest.js';

const router = Router();

const habitSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().optional(),
  category: z.string().optional(),
  targetPerDay: z.coerce.number().int().min(1).max(24).optional(),
  color: z.string().optional(),
});

const patchSchema = habitSchema.partial().extend({
  isArchived: z.boolean().optional(),
});

const logSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  count: z.coerce.number().int().min(1).max(24).optional(),
});

router.get('/', authenticate, requireTenant, requirePermission('habits.view'), habitController.listHabits);
router.get('/stats', authenticate, requireTenant, requirePermission('habits.view'), habitController.getStats);
router.post('/', authenticate, requireTenant, requirePermission('habits.create'), validateRequest(habitSchema), habitController.createHabit);
router.patch('/:id', authenticate, requireTenant, requirePermission('habits.edit'), validateRequest(patchSchema), habitController.updateHabit);
router.delete('/:id', authenticate, requireTenant, requirePermission('habits.delete'), habitController.removeHabit);

router.post('/:id/log', authenticate, requireTenant, requirePermission('habits.edit'), validateRequest(logSchema), habitController.logHabit);
router.delete('/:id/log', authenticate, requireTenant, requirePermission('habits.edit'), habitController.unlogHabit);

export default router;
