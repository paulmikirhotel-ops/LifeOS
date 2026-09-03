import { Router } from 'express';
import { z } from 'zod';
import * as tenantController from '../controllers/tenant.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/requireTenant.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { TENANT_ROLES } from '../config/permissions.js';

const router = Router();

const createSchema = z
  .object({
    type: z.enum(['personal', 'organization']),
    name: z.string().min(2).max(120).optional(),
  })
  .refine((v) => v.type !== 'organization' || !!v.name, { message: 'Organization name required' });

const switchSchema = z.object({ tenantId: z.string().min(1) });
const inviteSchema = z.object({
  email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Valid email required'),
  role: z.enum(TENANT_ROLES),
  permissions: z.array(z.string()).optional(),
});
const memberPatchSchema = z.object({
  role: z.enum(TENANT_ROLES).optional(),
  permissions: z.array(z.string()).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});
const acceptSchema = z.object({ token: z.string().min(10) });
const settingsSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  currency: z.string().min(3).max(3).optional(),
  openingBalance: z.coerce.number().min(0).optional(),
  allowOverlap: z.boolean().optional(),
  workingHours: z
    .object({
      startMin: z.coerce.number().int().min(0).max(1439).optional(),
      endMin: z.coerce.number().int().min(0).max(1439).optional(),
      days: z.array(z.coerce.number().int().min(0).max(6)).optional(),
    })
    .optional(),
});

// Workspace list & creation (auth only, no active tenant needed)
router.get('/', authenticate, tenantController.listWorkspaces);
router.post('/', authenticate, validateRequest(createSchema), tenantController.createWorkspace);

// Switching the ACTIVE workspace (server re-verifies membership)
router.post('/switch', authenticate, validateRequest(switchSchema), tenantController.switchWorkspace);

// Everything below operates on the ACTIVE workspace only (requireTenant boundary)
router.get('/settings', authenticate, requireTenant, tenantController.getSettings);
router.patch(
  '/settings',
  authenticate,
  requireTenant,
  requirePermission('settings.manage'),
  validateRequest(settingsSchema),
  tenantController.updateSettings
);

router.get('/members', authenticate, requireTenant, requirePermission('users.view'), tenantController.listMembers);
router.patch(
  '/members/:userId',
  authenticate,
  requireTenant,
  requirePermission('users.manage'),
  validateRequest(memberPatchSchema),
  tenantController.updateMember
);
router.delete('/members/:userId', authenticate, requireTenant, requirePermission('users.manage'), tenantController.removeMember);

router.post(
  '/invitations',
  authenticate,
  requireTenant,
  requirePermission('users.invite'),
  validateRequest(inviteSchema),
  tenantController.inviteMember
);
router.get('/invitations/resolve', tenantController.resolveInvitation); // public by token
router.post('/invitations/accept', authenticate, validateRequest(acceptSchema), tenantController.acceptInvitation);

export default router;
