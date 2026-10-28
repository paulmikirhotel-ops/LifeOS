// Run once from the client folder:  node scripts/apply-legal-patch.mjs
// Adds the /privacy /terms /help routes and points the sign-in footer links at them (edits in place).
import fs from 'node:fs';
const edit = (file, fn) => {
  if (!fs.existsSync(file)) return console.log('MISSING:', file);
  const a = fs.readFileSync(file, 'utf8'), b = fn(a);
  if (a === b) return console.log('unchanged:', file);
  fs.writeFileSync(file, b); console.log('patched:  ', file);
};
edit('src/routes/AppRoutes.jsx', (s) => {
  if (s.includes('PrivacyPage')) return s;
  s = s.replace(/(const NotFoundPage = lazy[^\n]*\n)/, `$1const PrivacyPage = lazy(() => import('../pages/legal/PrivacyPage.jsx'));
const TermsPage = lazy(() => import('../pages/legal/TermsPage.jsx'));
const HelpPage = lazy(() => import('../pages/legal/HelpPage.jsx'));
`);
  return s.replace(/([ \t]*)(\{\/\* Public, read-only shared meeting)/, `$1<Route path="/privacy" element={<PrivacyPage />} />
$1<Route path="/terms" element={<TermsPage />} />
$1<Route path="/help" element={<HelpPage />} />

$1$2`);
});
edit('src/layouts/AuthLayout.jsx', (s) =>
  s.replace(/<Link to="#"([^>]*)>Privacy<\/Link>/, '<Link to="/privacy"$1>Privacy</Link>')
   .replace(/<Link to="#"([^>]*)>Terms<\/Link>/, '<Link to="/terms"$1>Terms</Link>')
   .replace(/<Link to="#"([^>]*)>Help<\/Link>/, '<Link to="/help"$1>Help</Link>'));
console.log('\nNow edit src/pages/legal/legalConfig.js (your email, name, country).');
