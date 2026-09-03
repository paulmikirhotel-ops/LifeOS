/* Read-only diagnostic: what income/expense/category data actually exists in the DB.
   Prints counts + dates only — never the connection string or credentials. */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI missing from server/.env');
  process.exit(1);
}

// Redact the URI before any possible error output
const safeUri = uri.replace(/\/\/[^@]+@/, '//***:***@');
console.log('connecting to:', safeUri.split('?')[0]);

const dbName = (uri.split('?')[0].split('/').pop()) || 'unknown';
console.log('database name:', dbName);

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log('connected OK');
} catch (err) {
  console.error('connection FAILED:', err.message);
  process.exit(1);
}

const { Tenant, User, Income, Expense, FinancialCategory, Membership } = await import('../src/models/index.js');

const now = new Date();
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
monthStart.setHours(0, 0, 0, 0);
console.log(`\nnow: ${now.toISOString()}  | this-month start: ${monthStart.toISOString()}`);

const tenants = await Tenant.find().lean();
console.log(`\nTENANTS: ${tenants.length}`);
for (const t of tenants) {
  console.log(` - ${t._id}  name=${t.name || '(no name)'}  openingBalance=${t.settings?.openingBalance ?? 0}`);
}

const users = await User.find().lean();
console.log(`\nUSERS: ${users.length}`);
for (const u of users) {
  console.log(` - ${u._id}  email=${u.email}  tenantId=${u.tenantId || '(none)'}  activeTenantId=${u.activeTenantId || '(none)'}  role=${u.role || u.globalRole || ''}`);
}

const memberships = await Membership.find().lean();
console.log(`\nMEMBERSHIPS: ${memberships.length}`);
for (const m of memberships) {
  console.log(` - user=${m.userId} tenant=${m.tenantId} role=${m.role} status=${m.status} perms=[${(m.permissions || []).join(', ')}]`);
}

const catCount = await FinancialCategory.countDocuments();
const sysCats = await FinancialCategory.countDocuments({ tenantId: null });
console.log(`\nCATEGORIES total=${catCount} (system/global=${sysCats})`);

const incTotal = await Income.countDocuments();
const expTotal = await Expense.countDocuments();
console.log(`\nINCOME docs: ${incTotal}   EXPENSE docs: ${expTotal}`);

const lastInc = await Income.find().sort({ date: -1 }).limit(8).lean();
console.log('\nLATEST INCOMES:');
if (!lastInc.length) console.log(' (none)');
for (const i of lastInc) {
  console.log(` - ${i.date.toISOString()}  amount=${i.amount}  category=${i.category}  tenantId=${i.tenantId}  createdBy=${i.createdBy}`);
}

const lastExp = await Expense.find().sort({ date: -1 }).limit(8).lean();
console.log('\nLATEST EXPENSES:');
if (!lastExp.length) console.log(' (none)');
for (const e of lastExp) {
  console.log(` - ${e.date.toISOString()}  amount=${e.amount}  category=${e.category}  tenantId=${e.tenantId}`);
}

// Would the app's "current month" list actually return them?
const incThisMonth = await Income.countDocuments({ date: { $gte: monthStart, $lte: now } });
const expThisMonth = await Expense.countDocuments({ date: { $gte: monthStart, $lte: now } });
console.log(`\nApp-list test (date >= ${monthStart.toISOString()} and <= now): income=${incThisMonth}, expense=${expThisMonth}`);

// Per-tenant all-time + this-month sums, mirroring summary() logic
const tenantIds = tenants.map((t) => t._id);
for (const tid of tenantIds) {
  const allInc = await Income.aggregate([{ $match: { tenantId: tid } }, { $group: { _id: null, sum: { $sum: '$amount' }, n: { $sum: 1 } } }]);
  const allExp = await Expense.aggregate([{ $match: { tenantId: tid } }, { $group: { _id: null, sum: { $sum: '$amount' }, n: { $sum: 1 } } }]);
  const mInc = await Income.aggregate([{ $match: { tenantId: tid, date: { $gte: monthStart } } }, { $group: { _id: null, sum: { $sum: '$amount' }, n: { $sum: 1 } } }]);
  const mExp = await Expense.aggregate([{ $match: { tenantId: tid, date: { $gte: monthStart } } }, { $group: { _id: null, sum: { $sum: '$amount' }, n: { $sum: 1 } } }]);
  console.log(`\ntenant ${tid}:`);
  console.log(`  all-time  income=${allInc[0]?.sum ?? 0} (n=${allInc[0]?.n ?? 0})  expense=${allExp[0]?.sum ?? 0} (n=${allExp[0]?.n ?? 0})`);
  console.log(`  this-month income=${mInc[0]?.sum ?? 0} (n=${mInc[0]?.n ?? 0})  expense=${mExp[0]?.sum ?? 0} (n=${mExp[0]?.n ?? 0})`);
}

// Sum any income docs that fall OUTSIDE this month but exist (possible date bug)
const outside = await Income.find({ date: { $lt: monthStart } }).sort({ date: -1 }).limit(5).lean();
if (outside.length) {
  console.log('\nINCOMES OLDER THAN THIS MONTH (would NOT show in default list):');
  for (const i of outside) console.log(` - ${i.date.toISOString()}  amount=${i.amount}  category=${i.category}`);
}

await mongoose.disconnect();
console.log('\ndone');
