// Run once from the client folder:  node scripts/apply-pwa-patch.mjs
import fs from 'node:fs';
const edit = (file, fn) => {
  if (!fs.existsSync(file)) return console.log('MISSING:', file);
  const a = fs.readFileSync(file, 'utf8'), b = fn(a);
  if (a === b) return console.log('unchanged:', file);
  fs.writeFileSync(file, b); console.log('patched:  ', file);
};
edit('src/main.jsx', (s) => {
  if (s.includes('registerServiceWorker')) return s;
  s = s.replace(/(import '\.\/index\.css';)/, `$1\nimport { registerServiceWorker } from './pwa/registerSW.js';`);
  return s.trimEnd() + '\n\nregisterServiceWorker();\n';
});
edit('src/App.jsx', (s) => {
  if (s.includes('InstallPrompt')) return s;
  s = s.replace(/(import AppRoutes from [^\n]*\n)/, `$1import InstallPrompt from './pwa/InstallPrompt.jsx';\n`);
  const r = s.replace(/(\s*)<AppRoutes \/>/, `$1<AppRoutes />$1<InstallPrompt />`);
  if (r === s) console.log('WARNING: could not place <InstallPrompt /> in App.jsx - tell Claude');
  return r;
});
// Netlify: the service worker file must never be cached by the browser, or updates will not arrive.
edit('netlify.toml', (s) => {
  if (s.includes('/sw.js')) return s;
  return s.trimEnd() + `\n\n[[headers]]\n  for = "/sw.js"\n  [headers.values]\n    Cache-Control = "no-cache"\n\n[[headers]]\n  for = "/manifest.webmanifest"\n  [headers.values]\n    Cache-Control = "no-cache"\n`;
});
