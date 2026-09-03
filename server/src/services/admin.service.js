import { User, Tenant, Membership, Task, Income, Expense, DailyNote } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Platform administration — deliberately limited to platform entities and
 * AGGREGATE statistics. There are NO routes that return tenant-owned rows
 * (journal entries, tasks, finances, …). See docs/security-model.md R5.
 */
export const AdminService = {
  async getPlatformStats() {
    const [users, tenants, memberships, tasks, income, expenses, notes] = await Promise.all([
      User.countDocuments({ status: { $ne: 'deleted' } }),
      Tenant.countDocuments(),
      Membership.countDocuments({ status: 'active' }),
      Task.countDocuments(),
      Income.countDocuments(),
      Expense.countDocuments(),
      DailyNote.countDocuments(),
    ]);
    return {
      users,
      tenants,
      activeMemberships: memberships,
      storedRecords: { tasks, incomeRecords: income, expenseRecords: expenses, journalNotes: notes },
      database: { status: 'aggregate-only' },
    };
  },

  async listUsers(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 20));
    const filter = {};
    if (query.status) filter.status = query.status;
    const [items, total] = await Promise.all([
      User.find(filter)
        .select('name email role status isEmailVerified createdAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  },

  async setUserStatus(userId, status) {
    if (!['active', 'suspended'].includes(status)) throw ApiError.badRequest('Invalid status');
    const user = await User.findByIdAndUpdate(userId, { status }, { new: true });
    if (!user) throw ApiError.notFound('User not found');
    return { id: user._id.toString(), status: user.status };
  },

  async listTenants(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 20));
    const filter = {};
    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;
    const [items, total] = await Promise.all([
      Tenant.find(filter)
        .select('name type status ownerUserId createdAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Tenant.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  },

  async setTenantStatus(tenantId, status) {
    if (!['active', 'suspended'].includes(status)) throw ApiError.badRequest('Invalid status');
    const tenant = await Tenant.findByIdAndUpdate(tenantId, { status }, { new: true });
    if (!tenant) throw ApiError.notFound('Tenant not found');
    return { id: tenant._id.toString(), name: tenant.name, status: tenant.status };
  },
};
