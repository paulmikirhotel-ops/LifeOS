// Run once from the client folder:  node scripts/apply-push-patch.mjs
import fs from 'node:fs';
const edit = (file, fn) => {
  if (!fs.existsSync(file)) return console.log('MISSING:', file);
  const a = fs.readFileSync(file, 'utf8'), b = fn(a);
  if (a === b) return console.log('unchanged:', file);
  fs.writeFileSync(file, b); console.log('patched:  ', file);
};
edit('src/pages/SettingsPage.jsx', (s) => {
  if (s.includes('PushToggle')) return s;
  s = s.replace(/(import \{ useForm \} from 'react-hook-form';)/, `$1\nimport PushToggle from '../components/push/PushToggle.jsx';`);
  const r = s.replace(/\{activeTab === 'notifications' && <NotificationSettings \/>\}/, "{activeTab === 'notifications' && (<><NotificationSettings /><PushToggle /></>)}");
  if (r === s) console.log('WARNING: could not add the alerts card to Settings - tell Claude');
  return r;
});
