/**
 * One-off migration: grant the new meetings.* permissions to EXISTING memberships.
 *
 * Why: memberships store a snapshot of their effective permissions, so changing
 * ROLE_PERMISSIONS only affects members created afterwards. Owners ('*') need nothing.
 *
 *   node scripts/migrate-meeting-permissions.mjs          # dry run (default)
 *   node scripts/migrate-meeting-permissions.mjs --apply  # write changes
 *
 * Idempotent ($addToSet). Members with a custom permission list are only touched
 * if their role is assistant/viewer AND they already hold the matching *.view
 * permission, so deliberately restricted members are not silently widened.
 */
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Membership } from '../src/models/index.js';

const apply = process.argv.includes('--apply');

const PLAN = [
  { role: 'assistant', requires: 'schedule.view', add: ['meetings.view', 'meetings.create', 'meetings.edit', 'meetings.delete'] },
  { role: 'viewer', requires: 'schedule.view', add: ['meetings.view'] },
];

await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 8000 });
try {
  for (const { role, requires, add } of PLAN) {
    const eligible = { role, status: 'active', permissions: requires };
    const count = await Membership.countDocuments(eligible);
    const missing = await Membership.countDocuments({ ...eligible, $nor: add.map((p) => ({ permissions: p })) });
    console.log(`[${role}] eligible members: ${count}; missing meetings permissions: ${missing}`);
    if (apply) {
      const res = await Membership.updateMany(
        eligible,
        { $addToSet: { permissions: { $each: add } } }
      );
      console.log(`[${role}] updated ${res.modifiedCount}`);
    }
  }
  if (!apply) console.log('Dry run only. Re-run with --apply to write changes.');
} finally {
  await mongoose.disconnect();
}
