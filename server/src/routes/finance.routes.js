import { Router } from 'express';
import { z } from 'zod';
import * as financeController from '../controllers/finance.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/requireTenant.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { multerUpload } from '../services/file.service.js';

const router = Router();

// --- SCHEMAS ---

const categorySchema = z.object({
  name: z.string().min(1).max(60).trim(),
  type: z.enum(['income', 'expense']),
  color: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).optional(),
});

const categoryPatchSchema = categorySchema.partial();

const amountSchema = z.coerce.number().positive().max(1e9);
const dateSchema = z.coerce.date();

const incomeSchema = z.object({
  amount: amountSchema,
  category: z.string().min(1).max(60).trim(),
  date: dateSchema.optional(),
  source: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
});

const incomePatchSchema = incomeSchema.partial();

const expenseSchema = z.object({
  amount: amountSchema,
  category: z.string().min(1).max(60).trim(),
  date: dateSchema.optional(),
  vendor: z.string().max(120).optional(),
  paymentMethod: z.string().max(60).optional(),
  description: z.string().max(500).optional(),
});

const expensePatchSchema = expenseSchema.partial();

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  category: z.string().optional(),
});

// --- ROUTES ---

// Summary & Reports
router.get('/summary', authenticate, requireTenant, requirePermission('finance.view'), financeController.getSummary);
router.get('/reports', authenticate, requireTenant, requirePermission('finance.reports'), financeController.getReports);
router.get('/audit', authenticate, requireTenant, requirePermission('finance.reports'), financeController.listAudit);

// Categories
router.get('/categories', authenticate, requireTenant, requirePermission('finance.view'), financeController.listCategories);
router.post('/categories', authenticate, requireTenant, requirePermission('finance.create'), validateRequest(categorySchema), financeController.createCategory);
router.patch('/categories/:id', authenticate, requireTenant, requirePermission('finance.edit'), validateRequest(categoryPatchSchema), financeController.updateCategory);
router.delete('/categories/:id', authenticate, requireTenant, requirePermission('finance.delete'), financeController.deleteCategory);

// Evidence
router.post(
  '/evidence/upload',
  authenticate,
  requireTenant,
  requirePermission('finance.create'),
  multerUpload.single('file'),
  financeController.uploadEvidence
);
router.get('/evidence/:storedName', authenticate, requireTenant, requirePermission('finance.view'), financeController.downloadEvidence);

// Income
router.get('/income', authenticate, requireTenant, requirePermission('finance.view'), validateRequest(paginationSchema, 'query'), financeController.listIncome);
router.post('/income', authenticate, requireTenant, requirePermission('finance.create'), validateRequest(incomeSchema), financeController.createIncome);
router.patch('/income/:id', authenticate, requireTenant, requirePermission('finance.edit'), validateRequest(incomePatchSchema), financeController.updateIncome);
router.delete('/income/:id', authenticate, requireTenant, requirePermission('finance.delete'), financeController.deleteIncome);

// Expenses
router.get('/expenses', authenticate, requireTenant, requirePermission('finance.view'), validateRequest(paginationSchema.extend({ vendor: z.string().optional() }), 'query'), financeController.listExpenses);
router.post('/expenses', authenticate, requireTenant, requirePermission('finance.create'), validateRequest(expenseSchema), financeController.createExpense);
router.patch('/expenses/:id', authenticate, requireTenant, requirePermission('finance.edit'), validateRequest(expensePatchSchema), financeController.updateExpense);
router.delete('/expenses/:id', authenticate, requireTenant, requirePermission('finance.delete'), financeController.deleteExpense);

export default router;
