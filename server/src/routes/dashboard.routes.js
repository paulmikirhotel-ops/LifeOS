import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/requireTenant.js';

const router = Router();

router.get('/', authenticate, requireTenant, dashboardController.getDashboard);

export default router;
