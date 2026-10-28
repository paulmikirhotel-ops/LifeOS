import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as c from '../controllers/life.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/requireTenant.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { areaSchema, areaPatchSchema, logSchema, entrySchema, entryPatchSchema, settingsSchema, LIMITS } from '../utils/life.logic.js';

/**
 * Life Balance, Knowledge and Backup. Everything is per person inside the active workspace.
 * Reads need goals.view, changes need goals.create (same as Opportunities).
 */
const router = Router();
router.use(authenticate, requireTenant);
router.use(rateLimit({
  windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `life:${req.user.id}`,
  message: { success: false, message: 'Too many requests. Please wait a moment.' },
}));

const view = requirePermission('goals.view');
const edit = requirePermission('goals.create');

// Life Balance
router.get('/balance', view, c.balance);
router.get('/areas', view, c.areas);
router.post('/areas', edit, validateRequest(areaSchema), c.addArea);
router.patch('/areas/:id', edit, validateRequest(areaPatchSchema), c.updateArea);
router.delete('/areas/:id', edit, c.removeArea);
router.post('/logs', edit, validateRequest(logSchema), c.addLog);
router.delete('/logs/:id', edit, c.removeLog);

// Knowledge
router.get('/knowledge', view, c.entries);
router.post('/knowledge', edit, validateRequest(entrySchema), c.addEntry);
router.patch('/knowledge/:id', edit, validateRequest(entryPatchSchema), c.updateEntry);
router.delete('/knowledge/:id', edit, c.removeEntry);

// Backup
router.get('/backup', view, c.backupInfo);
router.put('/backup/settings', edit, validateRequest(settingsSchema), c.backupSettings);
router.get('/backup/export', view, c.exportBackup);
const upload = express.raw({ type: 'application/octet-stream', limit: LIMITS.restoreBytes });
router.post('/backup/preview', edit, upload, c.previewRestore);
router.post('/backup/restore', edit, upload, c.restore);

export default router;
