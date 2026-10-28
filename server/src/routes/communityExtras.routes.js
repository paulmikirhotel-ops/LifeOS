import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import * as c from '../controllers/communityExtras.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/requireTenant.js';
import { requireRole } from '../middleware/requireRole.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { resourceSchema, resourceReportSchema, resourceAdminStatusSchema, proposeSchema, counterSchema, respondSchema } from '../utils/communityExtras.logic.js';
import { startReminderLoop } from '../services/sessions.service.js';

/** Community extras: Learning resources and scheduled sessions. Signed-in people only; per person like the rest of Community. */
const router = Router();
router.use(authenticate);

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const idParam = z.object({ id: objectId });
const writes = rateLimit({
  windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `community-extras:${req.user.id}`, // signed-in only, so never the IP address
  message: { success: false, error: { message: 'Slow down a little and try again in a minute.' } },
});
const admin = requireRole('platform-admin');

router.get('/resources', c.listResources);
router.post('/resources', writes, validateRequest(resourceSchema), c.shareResource);
router.delete('/resources/:id', writes, validateRequest(idParam, 'params'), c.removeResource);
router.post('/resources/:id/report', writes, validateRequest(idParam, 'params'), validateRequest(resourceReportSchema), c.reportResource);
router.get('/admin/resource-reports', admin, c.adminResourceReports);
router.patch('/admin/resource-reports/:id', admin, validateRequest(idParam, 'params'), validateRequest(resourceAdminStatusSchema), c.adminSetResourceReport);
router.delete('/admin/resources/:id', admin, validateRequest(idParam, 'params'), c.adminRemoveResource);

router.get('/sessions/partners', c.partners);
router.get('/sessions', c.listSessions);
router.post('/sessions', writes, validateRequest(proposeSchema), c.propose);
router.post('/sessions/:id/respond', writes, validateRequest(idParam, 'params'), validateRequest(respondSchema), c.respond);
router.post('/sessions/:id/counter', writes, validateRequest(idParam, 'params'), validateRequest(counterSchema), c.counter);
router.post('/sessions/:id/cancel', writes, validateRequest(idParam, 'params'), c.cancel);
router.post('/sessions/:id/calendar', writes, validateRequest(idParam, 'params'), requireTenant, c.addToCalendar);

startReminderLoop(); // "starting soon" notes while the server is awake

export default router;
