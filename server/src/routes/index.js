import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import tenantRoutes from './tenant.routes.js';
import adminRoutes from './admin.routes.js';
import taskRoutes from './task.routes.js';
import scheduleRoutes from './schedule.routes.js';
import calendarRoutes from './calendar.routes.js';
import journalRoutes from './journal.routes.js';
import timeRoutes from './time.routes.js';
import focusRoutes from './focus.routes.js';
import habitRoutes from './habit.routes.js';
import goalRoutes from './goal.routes.js';
import financeRoutes from './finance.routes.js';
import notificationRoutes from './notification.routes.js';
import analyticsRoutes from './analytics.routes.js';
import dashboardRoutes from './dashboard.routes.js';

/**
 * API route registry — every module mounts here.
 */
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/tenants', tenantRoutes);
router.use('/admin', adminRoutes);
router.use('/tasks', taskRoutes);
router.use('/schedules', scheduleRoutes);
router.use('/calendar', calendarRoutes);
router.use('/journal', journalRoutes);
router.use('/time', timeRoutes);
router.use('/focus', focusRoutes);
router.use('/habits', habitRoutes);
router.use('/goals', goalRoutes);
router.use('/finance', financeRoutes);
router.use('/notifications', notificationRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;
