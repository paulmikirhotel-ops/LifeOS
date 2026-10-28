// Run from the client folder:  node scripts/apply-life-patch.mjs
// Adds the /life route and the "My life" sidebar item. Safe to run twice.
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
    hint: "const LifePage = lazy(() => import('../pages/LifePage.jsx'));",
    done: (s) => s.includes('LifePage'),
    re: /(const GoalsPage = lazy\([^\n]*\);)/,
    to: (m, eol) => `${m[1]}${eol}const LifePage = lazy(() => import('../pages/LifePage.jsx'));`,
  },
  {
    hint: '<Route path="/life" ... /> (next to the /goals route)',
    done: (s) => s.includes('path="/life"'),
    re: /([ \t]*)(<Route path="\/goals" element=\{<GoalsPage \/>\} \/>)/,
    to: (m, eol) => `${m[1]}${m[2]}${eol}${m[1]}<Route path="/life" element={<LifePage />} />`,
  },
]);

patch('src/layouts/AppLayout.jsx', [
  {
    hint: "import { Scale } from 'lucide-react';",
    done: (s) => /\bScale\b/.test(s),
    re: /(\} from 'lucide-react';)/,
    to: (m, eol) => `${m[1]}${eol}import { Scale } from 'lucide-react';`,
  },
  {
    hint: 'the "My life" sidebar item (after Opportunities, or Community, or Connect)',
    done: (s) => s.includes("path: '/life'"),
    re: /([ \t]*)(\{ label: 'Opportunities'[^\n]*\},)/,
    to: (m, eol) => `${m[1]}${m[2]}${eol}${m[1]}{ label: 'My life', icon: Scale, path: '/life', permission: 'goals.view' },`,
  },
  {
    hint: 'the "My life" sidebar item (fallback: after the Community or Connect item)',
    done: (s) => s.includes("path: '/life'"),
    re: /([ \t]*)(\{ label: '(?:Community|Connect)'[^\n]*\},)(?![\s\S]*\{ label: 'Community')/,
    to: (m, eol) => `${m[1]}${m[2]}${eol}${m[1]}{ label: 'My life', icon: Scale, path: '/life', permission: 'goals.view' },`,
  },
]);
