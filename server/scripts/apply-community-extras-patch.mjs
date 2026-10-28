// Run from the server folder:  node scripts/apply-community-extras-patch.mjs
// Mounts the Learning resources and Sessions routes under /api/community (src/routes/index.js). Safe to run twice.
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/routes/index.js');
if (!fs.existsSync(file)) { console.error('WARNING: run this inside the server folder (src/routes/index.js not found).'); process.exit(1); }
let src = fs.readFileSync(file, 'utf8');
const eol = src.includes('\r\n') ? '\r\n' : '\n';
let changed = false;

if (!src.includes('communityExtras.routes.js')) {
  const re = /(import communityRoutes from '\.\/community\.routes\.js';)/;
  if (re.test(src)) { src = src.replace(re, `$1${eol}import communityExtrasRoutes from './communityExtras.routes.js';`); changed = true; }
  else console.log("WARNING: could not find the community.routes import. Apply the Community phase first, or add by hand: import communityExtrasRoutes from './communityExtras.routes.js';");
}
if (!src.includes('communityExtrasRoutes);')) {
  // before the main community router, so these paths are always reached
  const re = /([ \t]*)(router\.use\('\/community', communityRoutes\);)/;
  if (re.test(src)) { src = src.replace(re, (m, sp, line) => `${sp}router.use('/community', communityExtrasRoutes);${eol}${sp}${line}`); changed = true; }
  else console.log("WARNING: could not find router.use('/community', communityRoutes). Add by hand, before it: router.use('/community', communityExtrasRoutes);");
}
if (changed) { fs.writeFileSync(file, src); console.log('patched src/routes/index.js'); } else console.log('src/routes/index.js: nothing to do');

for (const f of ['src/services/communityShared.js', 'src/services/connectNotify.service.js', 'src/services/connectSafety.service.js', 'src/models/community.model.js', 'src/middleware/requireRole.js', 'src/middleware/requireTenant.js']) {
  if (!fs.existsSync(path.resolve(f))) console.log(`WARNING: ${f} not found. Learning and Sessions need it (it comes from earlier phases).`);
}
console.log('Note: "starting soon" reminders are sent while the server is awake. On a host that puts the server to sleep, a reminder can be missed.');
