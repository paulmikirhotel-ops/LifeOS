import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import * as c from '../controllers/community.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { profileSchema, requestSchema, groupSchema, groupPatchSchema, reportSchema, listingSchema, listingPatchSchema, logSchema, logPatchSchema } from '../utils/community.logic.js';

/** Community (Skill Exchange). Signed-in people only; per person like Connect, so no workspace check. The service checks every rule. */
const router = Router();
router.use(authenticate);

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const idParam = z.object({ id: objectId });
const memberParam = z.object({ id: objectId, userId: objectId });
const userParam = z.object({ userId: objectId });

const writes = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => `community:${req.user.id}`, // signed-in only (authenticate runs first), so no IP is involved
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Slow down a little and try again in a minute.' } },
});

router.get('/me', c.getMine);
router.put('/profile', writes, validateRequest(profileSchema), c.saveProfile);

router.get('/mentors', c.listMentors);
router.post('/mentors/request', writes, validateRequest(requestSchema), c.requestSession);

router.get('/groups', c.listGroups);
router.post('/groups', writes, validateRequest(groupSchema), c.createGroup);
router.patch('/groups/:id', writes, validateRequest(idParam, 'params'), validateRequest(groupPatchSchema), c.updateGroup);
router.post('/groups/:id/join', writes, validateRequest(idParam, 'params'), validateRequest(z.object({ message: z.string().trim().max(200).optional() })), c.requestJoin);
router.post('/groups/:id/leave', writes, validateRequest(idParam, 'params'), c.leaveGroup);
router.delete('/groups/:id/members/:userId', writes, validateRequest(memberParam, 'params'), c.removeMember);

router.get('/impact', c.listListings);
router.post('/impact', writes, validateRequest(listingSchema), c.createListing);
router.patch('/impact/:id', writes, validateRequest(idParam, 'params'), validateRequest(listingPatchSchema), c.updateListing);
router.post('/impact/:id/interest', writes, validateRequest(idParam, 'params'), validateRequest(z.object({ message: z.string().trim().max(200).optional() })), c.interest);

router.get('/log', c.listLog);
router.post('/log', writes, validateRequest(logSchema), c.addLog);
router.patch('/log/:id', writes, validateRequest(idParam, 'params'), validateRequest(logPatchSchema), c.updateLog);
router.delete('/log/:id', writes, validateRequest(idParam, 'params'), c.removeLog);

router.get('/requests', c.listRequests);
router.post('/requests/:id/respond', writes, validateRequest(idParam, 'params'), validateRequest(z.object({ action: z.enum(['accept', 'decline']) })), c.respond);
router.delete('/requests/:id', writes, validateRequest(idParam, 'params'), c.cancelRequest);

router.post('/report', writes, validateRequest(reportSchema), c.report);
router.post('/block/:userId', writes, validateRequest(userParam, 'params'), c.block);

// Platform admins only: review reports about community profiles and groups.
router.get('/admin/reports', requireRole('platform-admin'), c.adminReports);
router.patch('/admin/reports/:id', requireRole('platform-admin'), validateRequest(idParam, 'params'), validateRequest(z.object({ status: z.enum(['open', 'reviewed', 'dismissed']) })), c.adminSetReport);

router.get('/admin/listings', requireRole('platform-admin'), c.adminListings);
router.patch('/admin/listings/:id/verify', requireRole('platform-admin'), validateRequest(idParam, 'params'), validateRequest(z.object({ verified: z.boolean() })), c.adminVerify);

export default router;
