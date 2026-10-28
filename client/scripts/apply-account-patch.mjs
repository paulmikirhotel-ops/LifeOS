// Run once from the client folder:  node scripts/apply-account-patch.mjs
import fs from 'node:fs';
const edit = (file, fn) => {
  if (!fs.existsSync(file)) return console.log('MISSING:', file);
  const a = fs.readFileSync(file, 'utf8'), b = fn(a);
  if (a === b) return console.log('unchanged:', file);
  fs.writeFileSync(file, b); console.log('patched:  ', file);
};
edit('src/pages/SettingsPage.jsx', (s) => {
  if (s.includes('AccountTools')) return s;
  s = s.replace(/(import \{ useForm \} from 'react-hook-form';)/, `$1\nimport AccountTools from '../components/account/AccountTools.jsx';`);
  const r = s.replace(/<DangerZone logout=\{logout\} \/>/, '<AccountTools logout={logout} />');
  if (r === s) console.log('WARNING: could not swap the Danger Zone panel - tell Claude');
  return r.replace("label: 'Danger Zone'", "label: 'Account tools'");
});
edit('src/routes/AppRoutes.jsx', (s) => {
  if (s.includes('ConfirmEmailChangePage')) return s;
  s = s.replace(/(const AcceptInvitePage = lazy[^\n]*\n)/, `$1const ConfirmEmailChangePage = lazy(() => import('../pages/ConfirmEmailChangePage.jsx'));\n`);
  return s.replace(/([ \t]*)(<Route path="\/accept-invite"[^\n]*\n)/, `$1$2$1<Route path="/confirm-email-change" element={<ConfirmEmailChangePage />} />\n`);
});
