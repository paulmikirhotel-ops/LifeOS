import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { targetFromNotification, CALL_CHANNEL, isNativeApp } from '../src/native/push.js';

test('a tapped call alert opens only pages inside the app', () => {
  assert.equal(targetFromNotification({ url: '/connect' }), '/connect');
  assert.equal(targetFromNotification({ url: '/connect/call/abc-1' }), '/connect/call/abc-1');
  for (const bad of ['https://evil.test', '//evil.test', 'javascript:alert(1)', '/a b', '', undefined, null, 5]) assert.equal(targetFromNotification({ url: bad }), '/connect', String(bad));
  assert.equal(targetFromNotification(undefined), '/connect');
});
test('the calls channel is loud and public', () => {
  assert.equal(CALL_CHANNEL.id, 'calls_ring'); assert.equal(CALL_CHANNEL.importance, 5); assert.equal(CALL_CHANNEL.visibility, 1); assert.equal(CALL_CHANNEL.vibration, true);
});
test('only the Android app counts as native', () => {
  assert.equal(isNativeApp(undefined), false);
  assert.equal(isNativeApp({}), false);
  assert.equal(isNativeApp({ isNativePlatform: () => false }), false);
  assert.equal(isNativeApp({ isNativePlatform: () => true }), true);
  assert.equal(isNativeApp({ isNativePlatform: () => { throw new Error('x'); } }), false);
});

const clientDir = fileURLToPath(new URL('..', import.meta.url));
const script = path.join(clientDir, 'scripts', 'apply-push-patch.mjs');
const made = [];
after(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const LAYOUT = `import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
export default function AppLayout() {
  const { user, logout, memberships } = useAuth();
  return null;
}
`;
const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application></application>
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.CAMERA" />
</manifest>
`;
function setup(eol) {
  const dir = fs.mkdtempSync(path.join(clientDir, '.tmp-push-')); made.push(dir);
  const w = (rel, t) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t.replace(/\n/g, eol)); };
  w('src/layouts/AppLayout.jsx', LAYOUT); w('android/app/src/main/AndroidManifest.xml', MANIFEST);
  return dir;
}
const run = (dir) => spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
for (const [name, eol] of [['LF', '\n'], ['CRLF', '\r\n']]) {
  test(`push patch (${name}) adds the hook and the permission once`, () => {
    const dir = setup(eol);
    const r = run(dir); assert.equal(r.status, 0, r.stderr);
    const l = fs.readFileSync(path.join(dir, 'src/layouts/AppLayout.jsx'), 'utf8');
    const m = fs.readFileSync(path.join(dir, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    assert.match(l, /import \{ useNativePush \} from '\.\.\/hooks\/useNativePush\.js';/);
    assert.match(l, /useNativePush\(user\);/);
    assert.ok(l.indexOf('useNativePush(user)') > l.indexOf('= useAuth()'));
    assert.match(m, /POST_NOTIFICATIONS/); assert.match(m, /VIBRATE/);
    for (const f of [l, m]) { if (eol === '\r\n') assert.ok(!/[^\r]\n/.test(f)); else assert.ok(!f.includes('\r')); }
    const r2 = run(dir); assert.equal(r2.status, 0); assert.equal((r2.stdout.match(/nothing to do/g) || []).length, 2);
    assert.equal(fs.readFileSync(path.join(dir, 'src/layouts/AppLayout.jsx'), 'utf8'), l);
  });
}
test('a layout it does not recognise is left alone', () => {
  const dir = setup('\n'); fs.writeFileSync(path.join(dir, 'src/layouts/AppLayout.jsx'), 'export default () => null;\n');
  const r = run(dir); assert.equal(r.status, 1); assert.match(r.stderr, /AppLayout\.jsx was NOT changed/);
  assert.equal(fs.readFileSync(path.join(dir, 'src/layouts/AppLayout.jsx'), 'utf8'), 'export default () => null;\n');
  assert.match(fs.readFileSync(path.join(dir, 'android/app/src/main/AndroidManifest.xml'), 'utf8'), /POST_NOTIFICATIONS/, 'the manifest step still ran');
});
