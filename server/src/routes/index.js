import { Router } from 'express';
import idempotency from '../middleware/idempotency.js';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import pushRoutes from './push.routes.js';
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
import lifeRoutes from './life.routes.js';
import communityRoutes from './community.routes.js';
import communityExtrasRoutes from './communityExtras.routes.js';
import radarRoutes from './radar.routes.js';
import nextstepRoutes from './nextstep.routes.js';
import assistantRoutes from './assistant.routes.js';
import financeRoutes from './finance.routes.js';
import notificationRoutes from './notification.routes.js';
import analyticsRoutes from './analytics.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import briefingRoutes from './briefing.routes.js';
import meetingRoutes from './meeting.routes.js';
import connectRoutes from './connect.routes.js';
import publicMeetingRoutes from './publicMeeting.routes.js';

/**
 * API route registry — every module mounts here.
 */
const router = Router();
// Retry protection for the phone's offline queue: a repeated write with the same key runs only once.
router.use(idempotency);

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/push', pushRoutes);
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
router.use('/life', lifeRoutes);
router.use('/community', communityExtrasRoutes);
router.use('/community', communityRoutes);
router.use('/radar', radarRoutes);
router.use('/nextstep', nextstepRoutes);
router.use('/assistant', assistantRoutes);
router.use('/finance', financeRoutes);
router.use('/notifications', notificationRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/briefing', briefingRoutes);
router.use('/meetings', meetingRoutes);
router.use('/connect', connectRoutes);
router.use('/public', publicMeetingRoutes);

export default router;
