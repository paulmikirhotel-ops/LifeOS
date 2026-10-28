// Run from the server folder:  node scripts/apply-life-patch.mjs
// Mounts /api/life (Life Balance, Knowledge, Backup) in src/routes/index.js. Safe to run twice.
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/routes/index.js');
if (!fs.existsSync(file)) { console.error('WARNING: run this inside the server folder (src/routes/index.js not found).'); process.exit(1); }
let src = fs.readFileSync(file, 'utf8');
const eol = src.includes('\r\n') ? '\r\n' : '\n';
let changed = false;

if (!src.includes('life.routes.js')) {
  const re = /(import goalRoutes from '\.\/goal\.routes\.js';)/;
  if (re.test(src)) { src = src.replace(re, `$1${eol}import lifeRoutes from './life.routes.js';`); changed = true; }
  else console.log("WARNING: could not find the goal.routes import. Add by hand: import lifeRoutes from './life.routes.js';");
}
if (!src.includes("'/life'")) {
  const re = /(router\.use\('\/goals', goalRoutes\);)/;
  if (re.test(src)) { src = src.replace(re, `$1${eol}router.use('/life', lifeRoutes);`); changed = true; }
  else console.log("WARNING: could not find router.use('/goals', ...). Add by hand: router.use('/life', lifeRoutes);");
}
if (changed) { fs.writeFileSync(file, src); console.log('patched src/routes/index.js'); } else console.log('src/routes/index.js: nothing to do');

// Backup restore uses express.raw, which needs express to be installed (it is: it comes with Express 5).
// This feature also needs the Opportunities (Radar) files from the earlier phase.
for (const f of ['src/models/radar.model.js', 'src/utils/radar.logic.js', 'src/utils/ApiError.js', 'src/middleware/requirePermission.js']) {
  if (!fs.existsSync(path.resolve(f))) console.log(`WARNING: ${f} not found. Life Balance, Knowledge and Backup need it.`);
}
