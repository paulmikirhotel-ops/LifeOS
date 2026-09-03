import { Router } from 'express';
import { z } from 'zod';
import * as calendarController from '../controllers/calendar.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/requireTenant.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateRequest } from '../middleware/validateRequest.js';

const router = Router();

const EVENT_TYPES = [
  'work',
  'school',
  'meeting',
  'study',
  'exercise',
  'personal',
  'appointment',
  'task',
  'other',
];

const listQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const createSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(EVENT_TYPES).default('personal'),
  description: z.string().max(2000).optional(),
  allDay: z.boolean().optional(),
  startAt: z.string().min(1),
  endAt: z.string().min(1).nullable().optional(),
});

const updateSchema = createSchema.partial();

router.get('/', authenticate, requireTenant, requirePermission('schedule.view'), validateRequest(listQuery, 'query'), calendarController.listEvents);
router.post('/', authenticate, requireTenant, requirePermission('schedule.create'), validateRequest(createSchema), calendarController.createEvent);
router.patch('/:id', authenticate, requireTenant, requirePermission('schedule.edit'), validateRequest(updateSchema), calendarController.updateEvent);
router.delete('/:id', authenticate, requireTenant, requirePermission('schedule.delete'), calendarController.deleteEvent);

export default router;
