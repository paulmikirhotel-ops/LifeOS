// Run from the client folder:  node scripts/apply-devices-patch.mjs
// Adds: the /login/qr page, the /link and /link/:code pages, a "Sign in with QR code" link on the sign-in page,
// and a "Link a device" item in the sidebar. Safe to run twice. Each file is written only if all of its steps worked.
import fs from 'node:fs';
import path from 'node:path';

if (!fs.existsSync(path.resolve('src/routes/AppRoutes.jsx'))) {
  console.error('WARNING: run this inside the client folder (src/routes/AppRoutes.jsx not found).');
  process.exit(1);
}
let failed = false;

function patch(rel, steps) {
  const file = path.resolve(rel);
  if (!fs.existsSync(file)) { console.warn(`WARNING: ${rel} not found, skipped.`); failed = true; return; }
  let src = fs.readFileSync(file, 'utf8');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  let changed = false;
  let bad = false;
  for (const step of steps) {
    if (step.done(src)) { continue; }
    const hit = (step.alternatives || [step]).find((s) => s.re.test(src));
    if (!hit) { if (!step.optional) { console.warn(`WARNING: ${rel}: could not find the place for: ${step.hint}`); bad = true; } continue; }
    src = src.replace(hit.re, (...m) => hit.to(m, eol));
    changed = true;
  }
  if (bad) { failed = true; console.warn(`WARNING: ${rel} was NOT changed because a step failed.`); return; }
  if (changed) { fs.writeFileSync(file, src); console.log(`patched ${rel}`); } else console.log(`${rel}: nothing to do`);
}

// ── routes ────────────────────────────────────────────────────────────
patch('src/routes/AppRoutes.jsx', [
  {
    hint: "the lazy imports (after the LoginPage or PlanPage import)",
    done: (s) => s.includes('QrSignInPage'),
    alternatives: [
      { re: /(const LoginPage = lazy\([^\n]*\);)/, to: (m, eol) => `${m[1]}${eol}const QrSignInPage = lazy(() => import('../pages/QrSignInPage.jsx'));${eol}const LinkDevicePage = lazy(() => import('../pages/LinkDevicePage.jsx'));` },
      { re: /(const PlanPage = lazy\([^\n]*\);)/, to: (m, eol) => `${m[1]}${eol}const QrSignInPage = lazy(() => import('../pages/QrSignInPage.jsx'));${eol}const LinkDevicePage = lazy(() => import('../pages/LinkDevicePage.jsx'));` },
    ],
  },
  {
    hint: '<Route path="/login" element={<LoginPage />} />',
    done: (s) => s.includes('path="/login/qr"'),
    re: /([ \t]*)(<Route path="\/login" element=\{<LoginPage \/>\} \/>)/,
    to: (m, eol) => `${m[1]}${m[2]}${eol}${m[1]}<Route path="/login/qr" element={<QrSignInPage />} />`,
  },
  {
    hint: 'the signed-in routes (next to /plan or /settings)',
    done: (s) => s.includes('path="/link"'),
    alternatives: [
      { re: /([ \t]*)(<Route path="\/plan" element=\{<PlanPage \/>\} \/>)/, to: (m, eol) => `${m[1]}${m[2]}${eol}${m[1]}<Route path="/link" element={<LinkDevicePage />} />${eol}${m[1]}<Route path="/link/:code" element={<LinkDevicePage />} />` },
      { re: /([ \t]*)(<Route path="\/settings"[^\n]*\/>)/, to: (m, eol) => `${m[1]}${m[2]}${eol}${m[1]}<Route path="/link" element={<LinkDevicePage />} />${eol}${m[1]}<Route path="/link/:code" element={<LinkDevicePage />} />` },
    ],
  },
]);

// ── sign-in page ──────────────────────────────────────────────────────
patch('src/pages/LoginPage.jsx', [
  {
    hint: "Link in the react-router-dom import",
    done: (s) => /import\s*\{[^}]*\bLink\b[^}]*\}\s*from 'react-router-dom'/.test(s),
    re: /import\s*\{([^}]*)\}\s*from 'react-router-dom';/,
    to: (m) => `import { ${m[1].trim()}, Link } from 'react-router-dom';`,
  },
  {
    hint: 'the end of the sign-in form (</form>)',
    done: (s) => s.includes('to="/login/qr"'),
    re: /([ \t]*)<\/form>/,
    to: (m, eol) => `${m[0]}${eol}${m[1]}<p className="mt-4 text-center text-sm"><Link to="/login/qr" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">Sign in with QR code (use your phone)</Link></p>`,
  },
]);

// ── sidebar ───────────────────────────────────────────────────────────
const item = (m, eol) => {
  const perm = m[2].match(/permission:\s*'([^']+)'/);
  return `${m[1]}${m[2]}${eol}${m[1]}{ label: 'Link a device', icon: QrCode, path: '/link'${perm ? `, permission: '${perm[1]}'` : ''} },`;
};
patch('src/layouts/AppLayout.jsx', [
  {
    hint: "import { QrCode } from 'lucide-react';",
    done: (s) => /\bQrCode\b/.test(s),
    re: /(\} from 'lucide-react';)/,
    to: (m, eol) => `${m[1]}${eol}import { QrCode } from 'lucide-react';`,
  },
  {
    hint: 'the "Link a device" sidebar item (after Plan, My life or Opportunities)',
    done: (s) => s.includes("path: '/link'"),
    alternatives: [
      { re: /([ \t]*)(\{ label: 'Plan'[^\n]*\},)/, to: item },
      { re: /([ \t]*)(\{ label: 'My life'[^\n]*\},)/, to: item },
      { re: /([ \t]*)(\{ label: 'Opportunities'[^\n]*\},)/, to: item },
    ],
  },
]);

process.exit(failed ? 1 : 0);
