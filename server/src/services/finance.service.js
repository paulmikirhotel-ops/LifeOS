import { isValidObjectId } from 'mongoose';
import {
  Income,
  Expense,
  FinancialCategory,
  AuditLog,
  Tenant,
} from '../models/index.js';
import { AuditService } from './audit.service.js';
import { ApiError } from '../utils/ApiError.js';
import { toObjectId } from '../utils/objectId.js';

const round = (val) => Math.round(val * 100) / 100;

/** Default categories auto-created for every workspace (tenantId: null = system-wide). */
export const DEFAULT_FINANCE_CATEGORIES = [
  { name: 'Food', type: 'expense' },
  { name: 'Transportation', type: 'expense' },
  { name: 'Rent', type: 'expense' },
  { name: 'Utilities', type: 'expense' },
  { name: 'Education', type: 'expense' },
  { name: 'Medical', type: 'expense' },
  { name: 'Office', type: 'expense' },
  { name: 'Project', type: 'expense' },
  { name: 'Church/Community', type: 'expense' },
  { name: 'Personal', type: 'expense' },
  { name: 'Other', type: 'expense' },
  { name: 'Salary', type: 'income' },
  { name: 'Business', type: 'income' },
  { name: 'Donation', type: 'income' },
  { name: 'Contribution', type: 'income' },
  { name: 'Grant', type: 'income' },
  { name: 'Interest', type: 'income' },
  { name: 'Other Income', type: 'income' },
];

export class FinanceService {
  // --- CATEGORIES ---

  /** Idempotent: seeds the default categories the first time a workspace needs them. */
  static async ensureDefaultCategories() {
    const exists = await FinancialCategory.findOne({ tenantId: null, isSystem: true }).lean();
    if (exists) return;
    try {
      const inserted = await FinancialCategory.insertMany(
        DEFAULT_FINANCE_CATEGORIES.map((c) => ({ ...c, tenantId: null, isSystem: true }))
      );
      console.log(`[finance] seeded ${inserted.length} default categories`);
    } catch (err) {
      // Concurrent first-load race — the other request already inserted them.
      if (err?.code !== 11000) console.error('[finance] category seed failed:', err.message);
    }
  }

  static async categoriesList(user, { type } = {}) {
    await FinanceService.ensureDefaultCategories();
    const query = {
      tenantId: { $in: [null, user.tenantId] },
      isArchived: false,
    };
    if (type) query.type = type;

    const items = await FinancialCategory.find(query)
      .sort({ isSystem: -1, name: 1 })
      .lean();
    return { items };
  }

  static async createCategory(user, { name, type, color }) {
    const existing = await FinancialCategory.findOne({
      tenantId: user.tenantId,
      type,
      name: name.trim(),
    });
    if (existing) throw ApiError.conflict('Category already exists');

    const category = await FinancialCategory.create({
      tenantId: user.tenantId,
      name,
      type,
      color,
      isSystem: false,
    });

    AuditService.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'CREATE_CATEGORY',
      resource: 'category',
      resourceId: category._id,
      details: { name, type },
    });

    return category;
  }

  static async updateCategory(user, id, patch) {
    if (!isValidObjectId(id)) throw ApiError.notFound('Category not found');
    const category = await FinancialCategory.findOne({
      _id: id,
      tenantId: user.tenantId,
    });
    if (!category) throw ApiError.notFound('Category not found');

    if (patch.name) category.name = patch.name.trim();
    if (patch.color) category.color = patch.color;
    if (patch.isArchived !== undefined) category.isArchived = !!patch.isArchived;

    await category.save();

    AuditService.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'UPDATE_CATEGORY',
      resource: 'category',
      resourceId: category._id,
      details: patch,
    });

    return category;
  }

  static async deleteCategory(user, id) {
    if (!isValidObjectId(id)) throw ApiError.notFound('Category not found');
    const category = await FinancialCategory.findOneAndDelete({
      _id: id,
      tenantId: user.tenantId,
    });
    if (!category) throw ApiError.notFound('Category not found');

    AuditService.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'DELETE_CATEGORY',
      resource: 'category',
      resourceId: category._id,
      details: { name: category.name, type: category.type },
    });
  }

  // --- INCOME ---

  static async incomeList(user, { from, to, category, page = 1, limit = 50 }) {
    const query = { tenantId: user.tenantId };
    const dateQuery = {};
    if (from) dateQuery.$gte = new Date(from);
    if (to) dateQuery.$lte = new Date(to);
    
    // Default to current month if no dates provided
    if (!from && !to) {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      dateQuery.$gte = start;
      dateQuery.$lte = new Date();
    }
    if (Object.keys(dateQuery).length > 0) query.date = dateQuery;
    if (category) query.category = category;

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      Income.find(query).sort({ date: -1 }).skip(skip).limit(limit).lean(),
      Income.countDocuments(query),
    ]);

    return { items, total, page, limit };
  }

  static async createIncome(user, { amount, category, date, source, description }) {
    const income = await Income.create({
      tenantId: user.tenantId,
      createdBy: user.id,
      amount: round(amount),
      category,
      date: date ? new Date(date) : new Date(),
      source,
      description,
    });

    AuditService.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'CREATE_INCOME',
      resource: 'income',
      resourceId: income._id,
      details: { amount: income.amount, category: income.category, date: income.date },
    });

    return income;
  }

  static async updateIncome(user, id, patch) {
    if (!isValidObjectId(id)) throw ApiError.notFound('Income record not found');
    const income = await Income.findOne({ _id: id, tenantId: user.tenantId });
    if (!income) throw ApiError.notFound('Income record not found');

    const before = { amount: income.amount };
    if (patch.amount !== undefined) income.amount = round(patch.amount);
    if (patch.category) income.category = patch.category;
    if (patch.date) income.date = new Date(patch.date);
    if (patch.source !== undefined) income.source = patch.source;
    if (patch.description !== undefined) income.description = patch.description;

    await income.save();

    AuditService.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'UPDATE_INCOME',
      resource: 'income',
      resourceId: income._id,
      details: { before, after: { amount: income.amount } },
    });

    return income;
  }

  static async removeIncome(user, id) {
    if (!isValidObjectId(id)) throw ApiError.notFound('Income record not found');
    const income = await Income.findOneAndDelete({ _id: id, tenantId: user.tenantId });
    if (!income) throw ApiError.notFound('Income record not found');

    AuditService.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'DELETE_INCOME',
      resource: 'income',
      resourceId: income._id,
      details: { amount: income.amount, category: income.category, date: income.date },
    });
  }

  // --- EXPENSE ---

  static async expenseList(user, { from, to, category, vendor, page = 1, limit = 50 }) {
    const query = { tenantId: user.tenantId };
    const dateQuery = {};
    if (from) dateQuery.$gte = new Date(from);
    if (to) dateQuery.$lte = new Date(to);
    
    if (!from && !to) {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      dateQuery.$gte = start;
      dateQuery.$lte = new Date();
    }
    if (Object.keys(dateQuery).length > 0) query.date = dateQuery;
    if (category) query.category = category;
    if (vendor) query.vendor = new RegExp(vendor, 'i');

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      Expense.find(query).sort({ date: -1 }).skip(skip).limit(limit).lean(),
      Expense.countDocuments(query),
    ]);

    return { items, total, page, limit };
  }

  static async createExpense(user, { amount, category, date, vendor, paymentMethod, description }) {
    const expense = await Expense.create({
      tenantId: user.tenantId,
      createdBy: user.id,
      amount: round(amount),
      category,
      date: date ? new Date(date) : new Date(),
      vendor,
      paymentMethod,
      description,
    });

    AuditService.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'CREATE_EXPENSE',
      resource: 'expense',
      resourceId: expense._id,
      details: { amount: expense.amount, category: expense.category, date: expense.date },
    });

    return expense;
  }

  static async updateExpense(user, id, patch) {
    if (!isValidObjectId(id)) throw ApiError.notFound('Expense record not found');
    const expense = await Expense.findOne({ _id: id, tenantId: user.tenantId });
    if (!expense) throw ApiError.notFound('Expense record not found');

    const before = { amount: expense.amount };
    if (patch.amount !== undefined) expense.amount = round(patch.amount);
    if (patch.category) expense.category = patch.category;
    if (patch.date) expense.date = new Date(patch.date);
    if (patch.vendor !== undefined) expense.vendor = patch.vendor;
    if (patch.paymentMethod !== undefined) expense.paymentMethod = patch.paymentMethod;
    if (patch.description !== undefined) expense.description = patch.description;

    await expense.save();

    AuditService.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'UPDATE_EXPENSE',
      resource: 'expense',
      resourceId: expense._id,
      details: { before, after: { amount: expense.amount } },
    });

    return expense;
  }

  static async removeExpense(user, id) {
    if (!isValidObjectId(id)) throw ApiError.notFound('Expense record not found');
    const expense = await Expense.findOneAndDelete({ _id: id, tenantId: user.tenantId });
    if (!expense) throw ApiError.notFound('Expense record not found');

    AuditService.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'DELETE_EXPENSE',
      resource: 'expense',
      resourceId: expense._id,
      details: { amount: expense.amount, category: expense.category, date: expense.date },
    });
  }

  // --- EVIDENCE ---

  static async attachEvidence(user, recordType, recordId, fileMeta) {
    if (!isValidObjectId(recordId)) throw ApiError.notFound('Record not found');
    const Model = recordType === 'income' ? Income : Expense;
    const record = await Model.findOne({ _id: recordId, tenantId: user.tenantId });
    if (!record) throw ApiError.notFound('Record not found');

    record.attachments.push(fileMeta);
    await record.save();

    AuditService.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'UPLOAD_EVIDENCE',
      resource: recordType,
      resourceId: record._id,
      details: { fileName: fileMeta.name, storedName: fileMeta.storedName },
    });

    return record;
  }

  static async findEvidence(user, storedName) {
    const [income, expense] = await Promise.all([
      Income.findOne({ tenantId: user.tenantId, 'attachments.storedName': storedName }).lean(),
      Expense.findOne({ tenantId: user.tenantId, 'attachments.storedName': storedName }).lean(),
    ]);

    if (!income && !expense) throw ApiError.notFound('Evidence not found');

    const record = income || expense;
    const recordType = income ? 'income' : 'expense';
    const attachment = record.attachments.find((a) => a.storedName === storedName);

    return { recordType, record, attachment };
  }

  // --- AUDIT ---

  static async auditList(user, { from, to, page = 1, limit = 50 }) {
    const query = { tenantId: user.tenantId };
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(query),
    ]);

    return { items, total, page, limit };
  }

  // --- REPORTS & SUMMARY ---

  static async reports(user, { from, to }) {
    const tenantId = user.tenantId;
    const tenantOid = toObjectId(tenantId);
    const tenant = await Tenant.findById(tenantId).lean();
    const openingBalance = tenant?.settings?.openingBalance || 0;

    const startDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = to ? new Date(to) : new Date();

    const [incomeData, expenseData, allTimeIncome, allTimeExpense, recentRecords] = await Promise.all([
      Income.aggregate([
        { $match: { tenantId: tenantOid, date: { $gte: startDate, $lte: endDate } } },
        {
          $facet: {
            total: [{ $group: { _id: null, sum: { $sum: '$amount' } } }],
            byCategory: [{ $group: { _id: '$category', total: { $sum: '$amount' } } }],
            series: [
              { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, total: { $sum: '$amount' } } },
            ],
          },
        },
      ]),
      Expense.aggregate([
        { $match: { tenantId: tenantOid, date: { $gte: startDate, $lte: endDate } } },
        {
          $facet: {
            total: [{ $group: { _id: null, sum: { $sum: '$amount' } } }],
            byCategory: [{ $group: { _id: '$category', total: { $sum: '$amount' } } }],
            series: [
              { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, total: { $sum: '$amount' } } },
            ],
          },
        },
      ]),
      Income.aggregate([
        { $match: { tenantId: tenantOid } },
        { $group: { _id: null, sum: { $sum: '$amount' } } },
      ]),
      Expense.aggregate([
        { $match: { tenantId: tenantOid } },
        { $group: { _id: null, sum: { $sum: '$amount' } } },
      ]),
      Promise.all([
        Income.find({ tenantId }).sort({ date: -1 }).limit(10).lean(),
        Expense.find({ tenantId }).sort({ date: -1 }).limit(10).lean(),
      ]).then(([inc, exp]) =>
        [...inc.map((r) => ({ ...r, type: 'income' })), ...exp.map((r) => ({ ...r, type: 'expense' }))]
          .sort((a, b) => b.date - a.date)
          .slice(0, 10)
      ),
    ]);

    const incomeTotal = round(incomeData[0].total[0]?.sum || 0);
    const expenseTotal = round(expenseData[0].total[0]?.sum || 0);
    const totalInc = allTimeIncome[0]?.sum || 0;
    const totalExp = allTimeExpense[0]?.sum || 0;
    const balance = round(openingBalance + totalInc - totalExp);

    // Merge series
    const seriesMap = {};
    incomeData[0].series.forEach((s) => {
      seriesMap[s._id] = { date: s._id, income: round(s.total), expense: 0 };
    });
    expenseData[0].series.forEach((s) => {
      if (!seriesMap[s._id]) seriesMap[s._id] = { date: s._id, income: 0, expense: round(s.total) };
      else seriesMap[s._id].expense = round(s.total);
    });
    const series = Object.values(seriesMap).sort((a, b) => a.date.localeCompare(b.date));

    const byCategory = [
      ...incomeData[0].byCategory.map((c) => ({ category: c._id, type: 'income', total: round(c.total) })),
      ...expenseData[0].byCategory.map((c) => ({ category: c._id, type: 'expense', total: round(c.total) })),
    ];

    return {
      from: startDate,
      to: endDate,
      openingBalance,
      incomeTotal,
      expenseTotal,
      balance,
      series,
      byCategory,
      recent: recentRecords,
    };
  }

  static async summary(user, { range = 'month' }) {
    const tenantId = user.tenantId;
    const tenantOid = toObjectId(tenantId);
    const now = new Date();
    let start = new Date();

    if (range === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (range === 'week') {
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
    } else {
      // month
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    }

    const [incomeRange, expenseRange, allTimeIncome, allTimeExpense, tenant] = await Promise.all([
      Income.aggregate([
        { $match: { tenantId: tenantOid, date: { $gte: start } } },
        { $group: { _id: null, sum: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Expense.aggregate([
        { $match: { tenantId: tenantOid, date: { $gte: start } } },
        { $group: { _id: null, sum: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Income.aggregate([
        { $match: { tenantId: tenantOid } },
        { $group: { _id: null, sum: { $sum: '$amount' } } },
      ]),
      Expense.aggregate([
        { $match: { tenantId: tenantOid } },
        { $group: { _id: null, sum: { $sum: '$amount' } } },
      ]),
      Tenant.findById(tenantId).lean(),
    ]);

    const openingBalance = tenant?.settings?.openingBalance || 0;
    const totalInc = allTimeIncome[0]?.sum || 0;
    const totalExp = allTimeExpense[0]?.sum || 0;
    const endDate = new Date();

    // Daily series + expense category breakdown for the range (Finance page charts).
    const [incSeries, expSeries, expCats] = await Promise.all([
      Income.aggregate([
        { $match: { tenantId: tenantOid, date: { $gte: start, $lte: endDate } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, total: { $sum: '$amount' } } },
      ]),
      Expense.aggregate([
        { $match: { tenantId: tenantOid, date: { $gte: start, $lte: endDate } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, total: { $sum: '$amount' } } },
      ]),
      Expense.aggregate([
        { $match: { tenantId: tenantOid, date: { $gte: start, $lte: endDate } } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
      ]),
    ]);

    const seriesMap = {};
    incSeries.forEach((s) => {
      seriesMap[s._id] = { date: s._id, income: round(s.total), expense: 0 };
    });
    expSeries.forEach((s) => {
      if (!seriesMap[s._id]) seriesMap[s._id] = { date: s._id, income: 0, expense: round(s.total) };
      else seriesMap[s._id].expense = round(s.total);
    });
    const dailySeries = Object.values(seriesMap).sort((a, b) => a.date.localeCompare(b.date));
    const categorySeries = expCats
      .map((c) => ({ name: c._id, value: round(c.total) }))
      .sort((a, b) => b.value - a.value);

    const rangeIncome = round(incomeRange[0]?.sum || 0);
    const rangeExpense = round(expenseRange[0]?.sum || 0);

    return {
      income: rangeIncome,
      expense: rangeExpense,
      totalIncome: rangeIncome,
      totalExpenses: rangeExpense,
      balance: round(openingBalance + totalInc - totalExp),
      incomeCount: incomeRange[0]?.count || 0,
      expenseCount: expenseRange[0]?.count || 0,
      dailySeries,
      categorySeries,
    };
  }
}
