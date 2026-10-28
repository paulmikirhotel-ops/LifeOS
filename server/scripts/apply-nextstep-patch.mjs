// Run from the server folder:  node scripts/apply-nextstep-patch.mjs
// Adds the NextStep routes to src/routes/index.js. Safe to run twice.
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

if (!src.includes("nextstep.routes.js")) {
  const importRe = /(import goalRoutes from '\.\/goal\.routes\.js';)/;
  if (importRe.test(src)) {
    src = src.replace(importRe, `$1${eol}import nextstepRoutes from './nextstep.routes.js';`);
    changed = true;
  } else {
    console.log("WARNING: could not find the goal.routes import. Add this line by hand: import nextstepRoutes from './nextstep.routes.js';");
  }
}
if (!src.includes("'/nextstep'")) {
  const useRe = /(router\.use\('\/goals', goalRoutes\);)/;
  if (useRe.test(src)) {
    src = src.replace(useRe, `$1${eol}router.use('/nextstep', nextstepRoutes);`);
    changed = true;
  } else {
    console.log("WARNING: could not find router.use('/goals', ...). Add this line by hand: router.use('/nextstep', nextstepRoutes);");
  }
}
if (changed) {
  fs.writeFileSync(file, src);
  console.log('patched src/routes/index.js');
} else {
  console.log('src/routes/index.js already has NextStep (nothing to do) or needs the manual lines above.');
}
