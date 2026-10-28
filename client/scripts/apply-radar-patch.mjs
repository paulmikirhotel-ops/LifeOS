// Run from the client folder:  node scripts/apply-radar-patch.mjs
// Adds the Radar page route and the sidebar item. Safe to run twice.
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
    hint: "const RadarPage = lazy(() => import('../pages/RadarPage.jsx'));",
    done: (s) => s.includes('RadarPage'),
    re: /(const GoalsPage = lazy\([^\n]*\);)/,
    to: (m, eol) => `${m[1]}${eol}const RadarPage = lazy(() => import('../pages/RadarPage.jsx'));`,
  },
  {
    hint: '<Route path="/radar" element={<RadarPage />} />',
    done: (s) => s.includes('path="/radar"'),
    re: /([ \t]*)(<Route path="\/goals" element=\{<GoalsPage \/>\} \/>)/,
    to: (m, eol) => `${m[1]}${m[2]}${eol}${m[1]}<Route path="/radar" element={<RadarPage />} />`,
  },
]);
patch('src/layouts/AppLayout.jsx', [
  {
    hint: "import { Radar } from 'lucide-react';",
    done: (s) => /\bRadar\b/.test(s),
    re: /(\} from 'lucide-react';)/,
    to: (m, eol) => `${m[1]}${eol}import { Radar } from 'lucide-react';`,
  },
  {
    hint: 'the Radar sidebar item (after the Goals item)',
    done: (s) => s.includes("path: '/radar'"),
    re: /([ \t]*)(\{ label: 'Goals'[^\n]*\},)/,
    to: (m, eol) => `${m[1]}${m[2]}${eol}${m[1]}{ label: 'Opportunities', icon: Radar, path: '/radar', permission: 'goals.view' },`,
  },
]);
