/**
 * Database seed — safe to run repeatedly (idempotent upserts).
 *   1. System finance categories shared by every tenant (tenantId: null).
 *   2. Platform admin (only when ADMIN_EMAIL + ADMIN_PASSWORD are provided).
 *
 * Usage (from server/):  node src/seed/seed.js
 * With admin:            $env:ADMIN_EMAIL='admin@lifeos.local'; $env:ADMIN_PASSWORD='ChangeMe123!'; node src/seed/seed.js
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { User, FinancialCategory } from '../models/index.js';

const SYSTEM_CATEGORIES = [
  // Expenses
  ['Food', 'expense', '#f59e0b'],
  ['Transport', 'expense', '#3b82f6'],
  ['Education', 'expense', '#8b5cf6'],
  ['Rent', 'expense', '#ef4444'],
  ['Utilities', 'expense', '#06b6d4'],
  ['Health', 'expense', '#10b981'],
  ['Business', 'expense', '#6366f1'],
  ['Church/Community', 'expense', '#ec4899'],
  ['Personal', 'expense', '#84cc16'],
  ['Other', 'expense', '#64748b'],
  // Income
  ['Salary', 'income', '#22c55e'],
  ['Business Income', 'income', '#0ea5e9'],
  ['Gift', 'income', '#a855f7'],
  ['Interest', 'income', '#eab308'],
  ['Other Income', 'income', '#78716c'],
];

async function seedSystemCategories() {
  for (const [name, type, color] of SYSTEM_CATEGORIES) {
    await FinancialCategory.updateOne(
      { tenantId: null, name, type },
      { $setOnInsert: { tenantId: null, name, type, color, isSystem: true } },
      { upsert: true }
    );
  }
  console.log(`[seed] ensured ${SYSTEM_CATEGORIES.length} system finance categories`);
}

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || password.length < 8) {
    console.log('[seed] no platform admin created (set ADMIN_EMAIL + ADMIN_PASSWORD ≥ 8 chars)');
    return;
  }
  const existing = await User.findOne({ email });
  if (existing) {
    console.log('[seed] platform admin already exists — skipping');
    return;
  }
  await User.create({
    name: 'Platform Admin',
    email,
    passwordHash: await bcrypt.hash(password, 12),
    role: 'platform-admin',
    isEmailVerified: true,
  });
  console.log(`[seed] platform admin created: ${email}`);
}

await mongoose.connect(env.mongoUri);
await seedSystemCategories();
await seedAdmin();
await mongoose.disconnect();
console.log('[seed] done');
process.exit(0);
