import * as financeService from '../services/finance.service.js';
import { evidenceFilePath } from '../services/file.service.js';
import { ApiError } from '../utils/ApiError.js';
import fs from 'fs';

// --- CATEGORIES ---

export async function listCategories(req, res) {
  const data = await financeService.FinanceService.categoriesList(req.user, req.query);
  res.json({ success: true, data });
}

export async function createCategory(req, res) {
  const data = await financeService.FinanceService.createCategory(req.user, req.body);
  res.status(201).json({ success: true, data });
}

export async function updateCategory(req, res) {
  const data = await financeService.FinanceService.updateCategory(req.user, req.params.id, req.body);
  res.json({ success: true, data });
}

export async function deleteCategory(req, res) {
  await financeService.FinanceService.deleteCategory(req.user, req.params.id);
  res.json({ success: true, data: { message: 'Category deleted' } });
}

// --- INCOME ---

export async function listIncome(req, res) {
  const data = await financeService.FinanceService.incomeList(req.user, req.query);
  res.json({ success: true, data });
}

export async function createIncome(req, res) {
  const data = await financeService.FinanceService.createIncome(req.user, req.body);
  res.status(201).json({ success: true, data });
}

export async function updateIncome(req, res) {
  const data = await financeService.FinanceService.updateIncome(req.user, req.params.id, req.body);
  res.json({ success: true, data });
}

export async function deleteIncome(req, res) {
  await financeService.FinanceService.removeIncome(req.user, req.params.id);
  res.json({ success: true, data: { message: 'Income record deleted' } });
}

// --- EXPENSES ---

export async function listExpenses(req, res) {
  const data = await financeService.FinanceService.expenseList(req.user, req.query);
  res.json({ success: true, data });
}

export async function createExpense(req, res) {
  const data = await financeService.FinanceService.createExpense(req.user, req.body);
  res.status(201).json({ success: true, data });
}

export async function updateExpense(req, res) {
  const data = await financeService.FinanceService.updateExpense(req.user, req.params.id, req.body);
  res.json({ success: true, data });
}

export async function deleteExpense(req, res) {
  await financeService.FinanceService.removeExpense(req.user, req.params.id);
  res.json({ success: true, data: { message: 'Expense record deleted' } });
}

// --- EVIDENCE ---

export async function uploadEvidence(req, res) {
  if (!req.file) throw ApiError.badRequest('No file uploaded');

  const { recordType, recordId } = req.body;
  
  try {
    if (!['income', 'expense'].includes(recordType) || !recordId) {
      throw ApiError.badRequest('Invalid recordType or recordId');
    }

    const fileMeta = {
      name: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
    };

    const data = await financeService.FinanceService.attachEvidence(req.user, recordType, recordId, fileMeta);
    res.status(201).json({ success: true, data });
  } catch (err) {
    // If error occurs after file saved, delete the file
    if (req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    throw err;
  }
}

export async function downloadEvidence(req, res) {
  const { storedName } = req.params;
  const { attachment } = await financeService.FinanceService.findEvidence(req.user, storedName);

  const filePath = evidenceFilePath(req.user.tenantId, storedName);
  
  if (!fs.existsSync(filePath)) {
    throw ApiError.notFound('File not found on disk');
  }

  res.type(attachment.mimeType);
  const encodedName = encodeURIComponent(attachment.name);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
  res.sendFile(filePath);
}

// --- AUDIT & REPORTS ---

export async function listAudit(req, res) {
  const data = await financeService.FinanceService.auditList(req.user, req.query);
  res.json({ success: true, data });
}

export async function getReports(req, res) {
  const data = await financeService.FinanceService.reports(req.user, req.query);
  res.json({ success: true, data });
}

export async function getSummary(req, res) {
  const data = await financeService.FinanceService.summary(req.user, req.query);
  res.json({ success: true, data });
}
