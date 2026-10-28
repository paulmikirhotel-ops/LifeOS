// Run from the server folder:  node scripts/apply-assistant-patch.mjs
// Adds the Assistant routes to src/routes/index.js. Safe to run twice.
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

if (!src.includes('assistant.routes.js')) {
  const re = /(import (?:nextstepRoutes|goalRoutes) from '\.\/(?:nextstep|goal)\.routes\.js';)/;
  const all = [...src.matchAll(new RegExp(re.source, 'g'))];
  if (all.length) {
    const last = all[all.length - 1][1];
    src = src.replace(last, `${last}${eol}import assistantRoutes from './assistant.routes.js';`);
    changed = true;
  } else console.log("WARNING: could not place the import. Add by hand: import assistantRoutes from './assistant.routes.js';");
}
if (!src.includes("'/assistant'")) {
  const re = /(router\.use\('\/(?:nextstep|goals)', \w+\);)/g;
  const all = [...src.matchAll(re)];
  if (all.length) {
    const last = all[all.length - 1][1];
    src = src.replace(last, `${last}${eol}router.use('/assistant', assistantRoutes);`);
    changed = true;
  } else console.log("WARNING: could not place the route. Add by hand: router.use('/assistant', assistantRoutes);");
}
if (changed) {
  fs.writeFileSync(file, src);
  console.log('patched src/routes/index.js');
} else console.log('src/routes/index.js: nothing to do (already patched, or see WARNING above).');
