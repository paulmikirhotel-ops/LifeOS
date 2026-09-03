import { Router } from 'express';
import { z } from 'zod';
import * as analyticsController from '../controllers/analytics.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/requireTenant.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateRequest } from '../middleware/validateRequest.js';

const router = Router();

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
});

router.get(
  '/overview',
  authenticate,
  requireTenant,
  requirePermission('analytics.view'),
  validateRequest(querySchema, 'query'),
  analyticsController.overview
);

// Home dashboard — any active member; sections are permission-aware.
router.get('/dashboard', authenticate, requireTenant, analyticsController.dashboard);

export default router;
