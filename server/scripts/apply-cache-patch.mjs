// Run once from the server folder:  node scripts/apply-cache-patch.mjs
// Edits your existing files in place (keeps your other changes), removes the global limiter, wires the cache.
import fs from 'node:fs';
const edit = (file, fn) => {
  if (!fs.existsSync(file)) return console.log('skip (missing):', file);
  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);
  if (after === before) return console.log('unchanged:', file);
  fs.writeFileSync(file, after);
  console.log('patched:  ', file);
};
// 1) app.js: remove the global limiter, add invalidate-on-write
edit('src/app.js', (s) => {
  if (s.includes('invalidateOnWrite')) return s;
  const re = /app\.use\(\s*'\/api',\s*rateLimit\([\s\S]*?\}\)\s*\);/;
  if (re.test(s)) s = s.replace(re, () => "// No global request limiter (login, public links and uploads keep their own route limits).\n  app.use('/api', invalidateOnWrite); // clears a user's cached reads after any successful write");
  else console.log('WARNING: global limiter block not found in app.js - remove it by hand');
  s = s.replace(/import rateLimit from 'express-rate-limit';\n/, '');
  return s.replace("from './config/env.js';", "from './config/env.js';\nimport { invalidateOnWrite } from './utils/cache.js';");
});
// 2) cache the read-heavy routes (after auth + permission checks, so a cache hit never skips them)
const addImport = (s) => s.includes('utils/cache.js') ? s : s.replace('\nconst router', "\nimport { cacheResponse } from '../utils/cache.js';\n\nconst router");
const wrap = (file, pairs) => edit('src/routes/' + file, (s) => {
  for (const [from, to] of pairs) if (s.includes(from) && !s.includes(to)) s = s.replace(from, to);
  return addImport(s);
});
wrap('dashboard.routes.js', [['requireTenant, dashboardController', 'requireTenant, cacheResponse(30), dashboardController']]);
wrap('analytics.routes.js', [
  ["validateRequest(querySchema, 'query'),\n  analyticsController.overview", "validateRequest(querySchema, 'query'),\n  cacheResponse(60),\n  analyticsController.overview"],
  ['requireTenant, analyticsController.dashboard', 'requireTenant, cacheResponse(30), analyticsController.dashboard'],
]);
wrap('habit.routes.js', [
  ["requirePermission('habits.view'), habitController.listHabits", "requirePermission('habits.view'), cacheResponse(30), habitController.listHabits"],
  ["requirePermission('habits.view'), habitController.getStats", "requirePermission('habits.view'), cacheResponse(30), habitController.getStats"],
]);
wrap('goal.routes.js', [["requirePermission('goals.view'), goalController.listGoals", "requirePermission('goals.view'), cacheResponse(30), goalController.listGoals"]]);
wrap('finance.routes.js', [
  ["requirePermission('finance.view'), financeController.getSummary", "requirePermission('finance.view'), cacheResponse(60), financeController.getSummary"],
  ["requirePermission('finance.reports'), financeController.getReports", "requirePermission('finance.reports'), cacheResponse(60), financeController.getReports"],
]);
