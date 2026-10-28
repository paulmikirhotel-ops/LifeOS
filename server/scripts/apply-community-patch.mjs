// Run from the server folder:  node scripts/apply-community-patch.mjs
// 1) mounts /api/community in src/routes/index.js
// 2) lets Connect notifications use two new types (community_request, community_update)
// Safe to run twice. Notifications are optional: without step 2 everything else still works.
import fs from 'node:fs';
import path from 'node:path';

function edit(rel, steps) {
  const file = path.resolve(rel);
  if (!fs.existsSync(file)) {
    console.log(`WARNING: ${rel} not found. Run this inside the server folder.`);
    return;
  }
  let src = fs.readFileSync(file, 'utf8');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  let changed = false;
  for (const { done, re, to, hint } of steps) {
    if (done(src)) continue;
    if (!re.test(src)) { console.log(`WARNING: ${rel}: could not find the place for: ${hint}`); continue; }
    src = src.replace(re, (...m) => to(m, eol));
    changed = true;
  }
  if (changed) { fs.writeFileSync(file, src); console.log(`patched ${rel}`); } else console.log(`${rel}: nothing to do`);
}

edit('src/routes/index.js', [
  {
    hint: "import communityRoutes from './community.routes.js';",
    done: (s) => s.includes('community.routes.js'),
    re: /(import goalRoutes from '\.\/goal\.routes\.js';)/,
    to: (m, eol) => `${m[1]}${eol}import communityRoutes from './community.routes.js';`,
  },
  {
    hint: "router.use('/community', communityRoutes);",
    done: (s) => s.includes("'/community'"),
    re: /(router\.use\('\/goals', goalRoutes\);)/,
    to: (m, eol) => `${m[1]}${eol}router.use('/community', communityRoutes);`,
  },
]);

edit('src/models/connectNotification.model.js', [
  {
    hint: "add 'community_request', 'community_update' to the notification type list",
    done: (s) => s.includes('community_request'),
    re: /'mention'\s*\]/,
    to: () => "'mention', 'community_request', 'community_update']",
  },
]);
