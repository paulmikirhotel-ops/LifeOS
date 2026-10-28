// Run from the client folder:  node scripts/apply-assistant-patch.mjs
// Adds the Assistant page route and the sidebar item. Safe to run twice.
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
    hint: "const AssistantPage = lazy(() => import('../pages/AssistantPage.jsx'));",
    done: (s) => s.includes('AssistantPage'),
    re: /(const (?:NextStepPage|GoalsPage) = lazy\([^\n]*\);)(?![\s\S]*const (?:NextStepPage|GoalsPage) = lazy)/,
    to: (m, eol) => `${m[1]}${eol}const AssistantPage = lazy(() => import('../pages/AssistantPage.jsx'));`,
  },
  {
    hint: '<Route path="/assistant" element={<AssistantPage />} />',
    done: (s) => s.includes('path="/assistant"'),
    re: /([ \t]*)(<Route path="\/(?:nextstep|goals)" element=\{<\w+ \/>\} \/>)(?![\s\S]*<Route path="\/(?:nextstep|goals)" element)/,
    to: (m, eol) => `${m[1]}${m[2]}${eol}${m[1]}<Route path="/assistant" element={<AssistantPage />} />`,
  },
]);

patch('src/layouts/AppLayout.jsx', [
  {
    hint: "import { Sparkles } from 'lucide-react';",
    done: (s) => /\bSparkles\b/.test(s),
    re: /(\} from 'lucide-react';)/,
    to: (m, eol) => `${m[1]}${eol}import { Sparkles } from 'lucide-react';`,
  },
  {
    hint: 'the Assistant sidebar item (after the NextStep or Goals item)',
    done: (s) => s.includes("path: '/assistant'"),
    re: /([ \t]*)(\{ label: '(?:NextStep|Goals)'[^\n]*\},)(?![\s\S]*\{ label: '(?:NextStep|Goals)')/,
    to: (m, eol) => `${m[1]}${m[2]}${eol}${m[1]}{ label: 'Assistant', icon: Sparkles, path: '/assistant', permission: '*' },`,
  },
]);
