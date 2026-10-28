// Run from the client folder:  node scripts/apply-offline-patch.mjs
// 1) connects offline mode to the axios client (src/api/client.js)
// 2) adds the /data page route, the "Data & offline" sidebar item and the status banner
// 3) stops Opportunities from refreshing feeds by itself in low-data mode
// Safe to run twice.
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

patch('src/api/client.js', [
  {
    hint: "import { attachOffline } from '../offline/attach.js'; (after the axios import)",
    done: (s) => s.includes('attachOffline'),
    re: /(import axios[^\n]*\n)/,
    to: (m, eol) => `${m[1]}import { attachOffline } from '../offline/attach.js';${eol}`,
  },
  {
    hint: 'attachOffline(api) right after axios.create(...) and before the first interceptor',
    done: (s) => /attachOffline\(\s*\w+\s*\)/.test(s),
    re: /((?:const|let)\s+(\w+)\s*=\s*axios\.create\([\s\S]*?\);)/,
    to: (m, eol) => `${m[1]}${eol}${eol}// Offline mode: must come before the interceptors below so offline answers flow through them.${eol}attachOffline(${m[2]});`,
  },
]);

patch('src/routes/AppRoutes.jsx', [
  {
    hint: "const DataPage = lazy(() => import('../pages/DataPage.jsx'));",
    done: (s) => s.includes('DataPage'),
    re: /(const GoalsPage = lazy\([^\n]*\);)/,
    to: (m, eol) => `${m[1]}${eol}const DataPage = lazy(() => import('../pages/DataPage.jsx'));`,
  },
  {
    hint: '<Route path="/data" ... /> (next to the /goals route)',
    done: (s) => s.includes('path="/data"'),
    re: /([ \t]*)(<Route path="\/goals" element=\{<GoalsPage \/>\} \/>)/,
    to: (m, eol) => `${m[1]}${m[2]}${eol}${m[1]}<Route path="/data" element={<DataPage />} />`,
  },
]);

patch('src/layouts/AppLayout.jsx', [
  {
    hint: "import { WifiOff } from 'lucide-react';",
    done: (s) => /\bWifiOff\b/.test(s),
    re: /(\} from 'lucide-react';)/,
    to: (m, eol) => `${m[1]}${eol}import { WifiOff } from 'lucide-react';`,
  },
  {
    hint: "import OfflineBanner from '../components/offline/OfflineBanner.jsx';",
    done: (s) => s.includes('OfflineBanner'),
    re: /(import \{ WifiOff \} from 'lucide-react';)/,
    to: (m, eol) => `${m[1]}${eol}import OfflineBanner from '../components/offline/OfflineBanner.jsx';`,
  },
  {
    hint: 'the "Data & offline" sidebar item (after the Community item, or the Connect item)',
    done: (s) => s.includes("path: '/data'"),
    re: /([ \t]*)(\{ label: '(?:Community|Connect)'[^\n]*\},)(?![\s\S]*\{ label: 'Community')/,
    to: (m, eol) => `${m[1]}${m[2]}${eol}${m[1]}{ label: 'Data & offline', icon: WifiOff, path: '/data', permission: '*' },`,
  },
  {
    hint: '<OfflineBanner /> just before <Outlet />',
    done: (s) => s.includes('<OfflineBanner />'),
    re: /([ \t]*)(<Outlet \/>)/,
    to: (m, eol) => `${m[1]}<OfflineBanner />${eol}${m[1]}${m[2]}`,
  },
]);

patch('src/pages/RadarPage.jsx', [
  {
    hint: "import { isLowData } from '../offline/status.js';",
    done: (s) => s.includes('isLowData'),
    re: /(import \{ radarApi \} from '\.\.\/api\/radar\.js';)/,
    to: (m, eol) => `${m[1]}${eol}import { isLowData } from '../offline/status.js';`,
  },
  {
    hint: 'skip the automatic feed refresh in low-data mode',
    done: (s) => /if \(isLowData\(\)\) return undefined;/.test(s),
    re: /(let alive = true;)(\r?\n[ \t]*)(radarApi\.refresh\(\))/,
    to: (m) => `${m[1]}${m[2]}if (isLowData()) return undefined; // low-data mode: refresh only when the person presses Refresh${m[2]}${m[3]}`,
  },
]);

// Reminder about the path names used for offline copies and queued writes.
const cfg = path.resolve('src/offline/logic.js');
if (fs.existsSync(cfg)) console.log('\nCheck src/offline/logic.js (CONFIG at the top): the names there must match your API paths (tasks, notes, ...).');
