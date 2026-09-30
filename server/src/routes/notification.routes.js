import { Router } from 'express';
import { z } from 'zod';
import * as notificationController from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/requireTenant.js';
import { validateRequest } from '../middleware/validateRequest.js';

const router = Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  isRead: z.enum(['true', 'false']).optional(),
  module: z.string().max(30).optional(),
});

const idParamsSchema = z.object({ id: objectId });

const markAllReadBodySchema = z.object({}).optional();

const prefsSchema = z.object({
  sound: z.boolean().optional(),
  toast: z.boolean().optional(),
  modules: z
    .object({
      task: z.boolean().optional(),
      schedule: z.boolean().optional(),
      calendar: z.boolean().optional(),
      journal: z.boolean().optional(),
      focus: z.boolean().optional(),
      finance: z.boolean().optional(),
      habit: z.boolean().optional(),
      goal: z.boolean().optional(),
      meeting: z.boolean().optional(),
      system: z.boolean().optional(),
      invitation: z.boolean().optional(),
    })
    .optional(),
});

router.get('/', authenticate, requireTenant, validateRequest(listQuerySchema, 'query'), notificationController.list);

// Real-time stream (SSE). Keep-alive connection, cookie/bearer authenticated.
router.get('/stream', authenticate, requireTenant, notificationController.stream);

router.get('/unread', authenticate, requireTenant, notificationController.listUnread);
router.get('/unread/count', authenticate, requireTenant, notificationController.unreadCount);

// Preferences are personal (not tenant-scoped) — auth only.
// IMPORTANT: must be registered BEFORE any '/:id' param route.
router.get('/preferences', authenticate, notificationController.getPreferences);
router.patch('/preferences', authenticate, validateRequest(prefsSchema), notificationController.patchPreferences);

router.patch('/read-all', authenticate, requireTenant, notificationController.markAllRead);
// Legacy aliases — old clients used POST variants.
router.post('/read-all', authenticate, requireTenant, validateRequest(markAllReadBodySchema), notificationController.markAllRead);
router.post('/mark-all-read', authenticate, requireTenant, notificationController.markAllRead);

router.patch('/:id/read', authenticate, requireTenant, validateRequest(idParamsSchema, 'params'), notificationController.markRead);
// Legacy single-read endpoint: PATCH /:id with { isRead: true }
router.patch('/:id', authenticate, requireTenant, validateRequest(idParamsSchema, 'params'), notificationController.markRead);
router.delete('/:id', authenticate, requireTenant, validateRequest(idParamsSchema, 'params'), notificationController.removeNotification);

export default router;
