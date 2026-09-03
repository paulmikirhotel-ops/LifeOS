import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as authController from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateRequest } from '../middleware/validateRequest.js';

const router = Router();

// Stricter limit for credential endpoints (brute-force protection).
router.use(
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false })
);

const email = z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Valid email required').max(254);
const password = z.string().min(8, 'At least 8 characters').max(100);

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email,
  password,
  tenantType: z.enum(['personal', 'organization']).optional().default('personal'),
  organizationName: z.string().min(2).max(120).optional(),
});

const loginSchema = z.object({ email, password });
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});
const tokenBodySchema = z.object({ token: z.string().min(10) });
const resetSchema = z.object({ token: z.string().min(10), newPassword: password });
const forgotSchema = z.object({ email });

router.post('/register', validateRequest(registerSchema), authController.register);
router.post('/login', validateRequest(loginSchema), authController.login);
router.post('/logout', authenticate, authController.logout);
router.post('/refresh', authController.refresh);
router.get('/me', authenticate, authController.me);
router.post('/change-password', authenticate, validateRequest(changePasswordSchema), authController.changePassword);
router.post('/forgot-password', validateRequest(forgotSchema), authController.forgotPassword);
router.post('/reset-password', validateRequest(resetSchema), authController.resetPassword);
router.post('/verify-email', validateRequest(tokenBodySchema), authController.verifyEmail);
router.delete('/account', authenticate, authController.deleteAccount);

export default router;
