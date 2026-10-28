/* Practice helper for the "goal gone quiet" alert.
   It makes ONE goal look 10 days old, so LifeOS treats it as untouched for a week and shows the alert.
   Only that goal's creation date changes. Nothing is deleted.

   Usage (from the server folder):
     node scripts/try-idle-goal.mjs "Practice goal"          make it look idle
     node scripts/try-idle-goal.mjs "Practice goal" --undo   put it back to now
*/
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const args = process.argv.slice(2);
const undo = args.includes('--undo');
const title = args.filter((a) => !a.startsWith('--')).join(' ').trim();
if (!title) {
  console.error('Tell me which goal: node scripts/try-idle-goal.mjs "Practice goal"');
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is missing from server/.env');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
const db = mongoose.connection.db;
const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const goals = await db.collection('goals').find({ title: { $regex: escaped, $options: 'i' }, status: 'active' }).toArray();
if (goals.length === 0) {
  console.error(`No active goal with "${title}" in its title.`);
  await mongoose.disconnect();
  process.exit(1);
}
if (goals.length > 1) {
  console.error('More than one goal matches. Use a more exact title:');
  goals.forEach((g) => console.error(`  - ${g.title}`));
  await mongoose.disconnect();
  process.exit(1);
}

const goal = goals[0];
const [tasks, habits, recentDone] = await Promise.all([
  db.collection('tasks').countDocuments({ goalId: goal._id, status: { $ne: 'cancelled' } }),
  db.collection('habits').countDocuments({ goalId: goal._id, isArchived: { $ne: true } }),
  db.collection('tasks').countDocuments({ goalId: goal._id, completedAt: { $gte: new Date(Date.now() - 7 * 86400000) } }),
]);

if (!undo && tasks + habits === 0) {
  console.error('This goal has no linked task or habit yet. Open its plan in the app and add one, then run this again.');
  await mongoose.disconnect();
  process.exit(1);
}

const when = undo ? new Date() : new Date(Date.now() - 10 * 86400000);
await db.collection('goals').updateOne({ _id: goal._id }, { $set: { createdAt: when } });

console.log(`Goal: ${goal.title}`);
console.log(`Linked: ${tasks} task(s), ${habits} habit(s)`);
console.log(undo ? 'Put back to now.' : 'Now looks 10 days old.');
if (!undo && recentDone > 0) {
  console.log(`Note: ${recentDone} linked task(s) were finished in the last 7 days, and that counts as activity. Mark them not done, or use a goal with no finished tasks.`);
}
if (!undo) {
  console.log('Next: open Today (Morning tab) and look for "Goals gone quiet". A notification also appears within about a minute while the server is running.');
}
await mongoose.disconnect();
