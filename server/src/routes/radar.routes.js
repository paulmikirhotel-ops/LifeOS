import { Router } from 'express';
import { z } from 'zod';
import * as c from '../controllers/radar.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/requireTenant.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateRequest } from '../middleware/validateRequest.js';

/** Opportunity Radar. Per person inside the active workspace. Reads need goals.view, changes need goals.create. */
const router = Router();
router.use(authenticate, requireTenant);

const type = z.enum(['auto', 'job', 'scholarship', 'grant', 'other']);
const addSchema = z.object({ url: z.string().trim().min(8).max(500), name: z.string().trim().max(80).optional(), type: type.optional() });
const srcPatch = z.object({ name: z.string().trim().min(1).max(80).optional(), type: type.optional() });
const refreshSchema = z.object({ sourceId: z.string().length(24).optional(), force: z.boolean().optional() });
const profileSchema = z.object({ keywords: z.array(z.string().trim().max(40)).max(20) });
const stateSchema = z.object({ state: z.enum(['new', 'saved', 'dismissed']) });

router.get('/feed', requirePermission('goals.view'), c.feed);
router.get('/sources', requirePermission('goals.view'), c.sources);
router.get('/profile', requirePermission('goals.view'), c.getProfile);

router.post('/sources', requirePermission('goals.create'), validateRequest(addSchema), c.addSource);
router.patch('/sources/:id', requirePermission('goals.create'), validateRequest(srcPatch), c.updateSource);
router.delete('/sources/:id', requirePermission('goals.create'), c.removeSource);
router.post('/refresh', requirePermission('goals.view'), validateRequest(refreshSchema), c.refresh);
router.put('/profile', requirePermission('goals.create'), validateRequest(profileSchema), c.saveProfile);
router.patch('/items/:id', requirePermission('goals.view'), validateRequest(stateSchema), c.setState);
router.post('/items/:id/task', requirePermission('goals.create'), c.addTask);
router.post('/items/:id/explain', requirePermission('goals.view'), c.explain);

export default router;
