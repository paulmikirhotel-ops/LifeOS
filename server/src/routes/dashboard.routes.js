import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/requireTenant.js';

import { cacheResponse } from '../utils/cache.js';

const router = Router();

router.get('/', authenticate, requireTenant, cacheResponse(30), dashboardController.getDashboard);

export default router;
