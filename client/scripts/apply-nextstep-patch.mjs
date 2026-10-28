// Run from the client folder:  node scripts/apply-nextstep-patch.mjs
// Adds the NextStep page route, the sidebar item and the "next step" card on the dashboard. Safe to run twice.
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
    if (!re.test(src)) {
      console.log(`WARNING: ${rel}: could not find the place for: ${hint}`);
      continue;
    }
    src = src.replace(re, (...m) => to(m, eol));
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(file, src);
    console.log(`patched ${rel}`);
  } else console.log(`${rel}: nothing to do`);
}

patch('src/routes/AppRoutes.jsx', [
  {
    hint: "const NextStepPage = lazy(() => import('../pages/NextStepPage.jsx'));",
    done: (s) => s.includes('NextStepPage'),
    re: /(const GoalsPage = lazy\([^\n]*\);)/,
    to: (m, eol) => `${m[1]}${eol}const NextStepPage = lazy(() => import('../pages/NextStepPage.jsx'));`,
  },
  {
    hint: '<Route path="/nextstep" element={<NextStepPage />} />',
    done: (s) => s.includes('path="/nextstep"'),
    re: /([ \t]*)(<Route path="\/goals" element=\{<GoalsPage \/>\} \/>)/,
    to: (m, eol) => `${m[1]}${m[2]}${eol}${m[1]}<Route path="/nextstep" element={<NextStepPage />} />`,
  },
]);

patch('src/layouts/AppLayout.jsx', [
  {
    hint: "import { Compass } from 'lucide-react';",
    done: (s) => /\bCompass\b/.test(s),
    re: /(\} from 'lucide-react';)/,
    to: (m, eol) => `${m[1]}${eol}import { Compass } from 'lucide-react';`,
  },
  {
    hint: "the NextStep sidebar item (after the Goals item)",
    done: (s) => s.includes("path: '/nextstep'"),
    re: /([ \t]*)(\{ label: 'Goals'[^\n]*\},)/,
    to: (m, eol) => `${m[1]}${m[2]}${eol}${m[1]}{ label: 'NextStep', icon: Compass, path: '/nextstep', permission: 'goals.view' },`,
  },
]);

patch('src/pages/DashboardPage.jsx', [
  {
    hint: "import NextStepCard from '../components/nextstep/NextStepCard.jsx';",
    done: (s) => s.includes('NextStepCard'),
    re: /(import \{ useToast \} from '\.\.\/context\/ToastContext\.jsx';)/,
    to: (m, eol) => `${m[1]}${eol}import NextStepCard from '../components/nextstep/NextStepCard.jsx';`,
  },
  {
    hint: '<NextStepCard /> under the dashboard header (add it by hand where you want it)',
    done: (s) => s.includes('<NextStepCard'),
    re: /([ \t]*)(<\/header>)/,
    to: (m, eol) => `${m[1]}${m[2]}${eol}${eol}${m[1]}<NextStepCard />`,
  },
]);
