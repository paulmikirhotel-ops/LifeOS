import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const clientDir = fileURLToPath(new URL('..', import.meta.url));
const script = path.join(clientDir, 'scripts', 'apply-devices-patch.mjs');
const made = [];
after(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const ROUTES = `import React, { lazy } from 'react';
const LoginPage = lazy(() => import('../pages/LoginPage.jsx'));
const PlanPage = lazy(() => import('../pages/PlanPage.jsx'));
export default function R() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
`;
const LOGIN = `import React from 'react';
import { useNavigate } from 'react-router-dom';
export default function LoginPage() {
  return (
    <div>
      <form onSubmit={go}>
        <input />
      </form>
    </div>
  );
}
`;
const LAYOUT = `import { Home, Crown } from 'lucide-react';
const items = [
  { label: 'Home', icon: Home, path: '/', permission: 'dashboard.view' },
  { label: 'Plan', icon: Crown, path: '/plan', permission: 'goals.view' },
];
`;

function setup(eol) {
  const dir = fs.mkdtempSync(path.join(clientDir, '.tmp-dev-'));
  made.push(dir);
  const w = (rel, text) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text.replace(/\n/g, eol)); };
  w('src/routes/AppRoutes.jsx', ROUTES); w('src/pages/LoginPage.jsx', LOGIN); w('src/layouts/AppLayout.jsx', LAYOUT);
  return dir;
}
const run = (dir) => spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');

for (const [name, eol] of [['LF', '\n'], ['CRLF', '\r\n']]) {
  test(`patch works on ${name} files, keeps the line endings, and a second run changes nothing`, () => {
    const dir = setup(eol);
    const r1 = run(dir);
    assert.equal(r1.status, 0, r1.stderr + r1.stdout);
    assert.match(r1.stdout, /patched src\/routes\/AppRoutes\.jsx/);
    const routes = read(dir, 'src/routes/AppRoutes.jsx');
    assert.match(routes, /const QrSignInPage = lazy/);
    assert.match(routes, /const LinkDevicePage = lazy/);
    assert.match(routes, /<Route path="\/login\/qr" element=\{<QrSignInPage \/>\} \/>/);
    assert.match(routes, /<Route path="\/link" element=\{<LinkDevicePage \/>\} \/>/);
    assert.match(routes, /<Route path="\/link\/:code" element=\{<LinkDevicePage \/>\} \/>/);
    const login = read(dir, 'src/pages/LoginPage.jsx');
    assert.match(login, /import \{ useNavigate, Link \} from 'react-router-dom';/);
    assert.match(login, /to="\/login\/qr"/);
    assert.ok(login.indexOf('</form>') < login.indexOf('/login/qr'));
    const layout = read(dir, 'src/layouts/AppLayout.jsx');
    assert.match(layout, /import \{ QrCode \} from 'lucide-react';/);
    assert.match(layout, /\{ label: 'Link a device', icon: QrCode, path: '\/link', permission: 'goals\.view' \},/);
    for (const f of [routes, login, layout]) {
      if (eol === '\r\n') assert.ok(!/[^\r]\n/.test(f), 'mixed line endings');
      else assert.ok(!f.includes('\r'));
    }
    const before = [routes, login, layout];
    const r2 = run(dir);
    assert.equal(r2.status, 0);
    assert.equal((r2.stdout.match(/nothing to do/g) || []).length, 3);
    assert.deepEqual([read(dir, 'src/routes/AppRoutes.jsx'), read(dir, 'src/pages/LoginPage.jsx'), read(dir, 'src/layouts/AppLayout.jsx')], before);
  });
}

test('if a place cannot be found, that file is left alone and the script says so', () => {
  const dir = setup('\n');
  fs.writeFileSync(path.join(dir, 'src/pages/LoginPage.jsx'), 'export default function LoginPage() { return null; }\n');
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /LoginPage\.jsx/);
  assert.equal(read(dir, 'src/pages/LoginPage.jsx'), 'export default function LoginPage() { return null; }\n');
  assert.match(read(dir, 'src/routes/AppRoutes.jsx'), /QrSignInPage/);
});

test('refuses to run outside the client folder', () => {
  const dir = fs.mkdtempSync(path.join(clientDir, '.tmp-dev-')); made.push(dir);
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /inside the client folder/);
});
