// Run from the client folder:  node scripts/apply-community-patch.mjs
// Adds the Community page route, the admin reports route and the sidebar item. Safe to run twice.
import fs from 'node:fs';
import path from 'node:path';

if (!fs.existsSync(path.resolve('src/routes/AppRoutes.jsx'))) {
  console.error('WARNING: run this inside the client folder (src/routes/AppRoutes.jsx not found).');
  process.exit(1);
}
function patch(rel, steps) {
  const file = path.resolve(rel);
  if (!fs.existsSync(file)) return console.log(`WARNING: ${rel} not found, skipped.`);
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

patch('src/routes/AppRoutes.jsx', [
  {
    hint: "const CommunityPage = lazy(() => import('../pages/CommunityPage.jsx'));",
    done: (s) => s.includes('CommunityPage'),
    re: /(const GoalsPage = lazy\([^\n]*\);)/,
    to: (m, eol) => `${m[1]}${eol}const CommunityPage = lazy(() => import('../pages/CommunityPage.jsx'));${eol}const CommunityReportsPage = lazy(() => import('../pages/CommunityReportsPage.jsx'));`,
  },
  {
    hint: '<Route path="/community" ... /> (next to the /goals route)',
    done: (s) => s.includes('path="/community"'),
    re: /([ \t]*)(<Route path="\/goals" element=\{<GoalsPage \/>\} \/>)/,
    to: (m, eol) => `${m[1]}${m[2]}${eol}${m[1]}<Route path="/community" element={<CommunityPage />} />${eol}${m[1]}<Route path="/admin/community-reports" element={<CommunityReportsPage />} />`,
  },
]);

patch('src/layouts/AppLayout.jsx', [
  {
    hint: "import { HandHeart } from 'lucide-react';",
    done: (s) => /\bHandHeart\b/.test(s),
    re: /(\} from 'lucide-react';)/,
    to: (m, eol) => `${m[1]}${eol}import { HandHeart } from 'lucide-react';`,
  },
  {
    hint: 'the Community sidebar item (after the Connect item)',
    done: (s) => s.includes("path: '/community'"),
    re: /([ \t]*)(\{ label: 'Connect'[^\n]*\},)/,
    to: (m, eol) => `${m[1]}${m[2]}${eol}${m[1]}{ label: 'Community', icon: HandHeart, path: '/community', permission: '*' },`,
  },
]);
