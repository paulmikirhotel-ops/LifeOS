import { Router } from 'express';
import { z } from 'zod';
import * as taskController from '../controllers/task.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/requireTenant.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { optDate, clearableDate } from '../utils/flex.js';

const router = Router();

const taskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).optional(),
  status: z.enum(['not_started', 'in_progress', 'completed', 'cancelled', 'postponed']).optional(),
  category: z.string().optional(),
  dueDate: clearableDate,
  estimatedMinutes: z.coerce.number().int().min(0).optional(),
  actualMinutes: z.coerce.number().int().min(0).optional(),
  recurrenceType: z.enum(['none', 'daily', 'weekly', 'monthly']).optional(),
  subtasks: z
    .array(
      z.object({
        title: z.string().min(1),
        isDone: z.boolean().optional(),
      })
    )
    .optional(),
  notes: z.string().optional(),
});

const taskPatchSchema = taskSchema.partial();

const planSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  durationMin: z.coerce.number().int().min(15).max(480),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category: z.string().optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).optional(),
});

const querySchema = z.object({
  status: z.enum(['not_started', 'in_progress', 'completed', 'cancelled', 'postponed']).optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  dueFrom: optDate,
  dueTo: optDate,
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

router.use(authenticate, requireTenant);

router.get('/', requirePermission('tasks.view'), validateRequest(querySchema, 'query'), taskController.listTasks);
router.get('/today', requirePermission('tasks.view'), taskController.getTodayTasks);
router.get('/:id', requirePermission('tasks.view'), taskController.getTask);

router.post('/', requirePermission('tasks.create'), validateRequest(taskSchema), taskController.createTask);
router.post('/plan', requirePermission('tasks.create'), validateRequest(planSchema), taskController.planSmart);

router.patch('/:id', requirePermission('tasks.edit'), validateRequest(taskPatchSchema), taskController.updateTask);
router.delete('/:id', requirePermission('tasks.delete'), taskController.deleteTask);

export default router;
