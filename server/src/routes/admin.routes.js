import { Router } from 'express';
import { z } from 'zod';
import * as adminController from '../controllers/admin.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validateRequest } from '../middleware/validateRequest.js';

const router = Router();

// Platform admin only — NO tenant data is exposed here (see docs/security-model.md R5).
router.use(authenticate, requireRole('platform-admin'));

const statusSchema = z.object({ status: z.enum(['active', 'suspended']) });

router.get('/stats', adminController.getStats);
router.get('/users', adminController.listUsers);
router.patch('/users/:userId/status', validateRequest(statusSchema), adminController.setUserStatus);
router.get('/tenants', adminController.listTenants);
router.patch('/tenants/:tenantId/status', validateRequest(statusSchema), adminController.setTenantStatus);

export default router;
