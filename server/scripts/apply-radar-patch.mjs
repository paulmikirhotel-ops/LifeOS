// Run from the server folder:  node scripts/apply-radar-patch.mjs
// Adds the Radar routes to src/routes/index.js. Safe to run twice.
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/routes/index.js');
if (!fs.existsSync(file)) {
  console.error('WARNING: run this inside the server folder (src/routes/index.js not found).');
  process.exit(1);
}
let src = fs.readFileSync(file, 'utf8');
const eol = src.includes('\r\n') ? '\r\n' : '\n';
let changed = false;

if (!src.includes('radar.routes.js')) {
  const re = /(import goalRoutes from '\.\/goal\.routes\.js';)/;
  if (re.test(src)) { src = src.replace(re, `$1${eol}import radarRoutes from './radar.routes.js';`); changed = true; }
  else console.log("WARNING: could not find the goal.routes import. Add by hand: import radarRoutes from './radar.routes.js';");
}
if (!src.includes("'/radar'")) {
  const re = /(router\.use\('\/goals', goalRoutes\);)/;
  if (re.test(src)) { src = src.replace(re, `$1${eol}router.use('/radar', radarRoutes);`); changed = true; }
  else console.log("WARNING: could not find router.use('/goals', ...). Add by hand: router.use('/radar', radarRoutes);");
}
if (changed) { fs.writeFileSync(file, src); console.log('patched src/routes/index.js'); }
else console.log('src/routes/index.js already has Radar (nothing to do) or needs the manual lines above.');
