import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'scripts', 'apply-audio-patch.mjs');
const dirs = [];
after(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const MAIN = `package com.lifeos.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(android.os.Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    createCallChannel();
  }
}
`;
const MANIFEST = `<manifest>
    <uses-permission android:name="android.permission.INTERNET" />
</manifest>
`;
const CALL = `import { callPhase } from '../../../utils/callState.js';
export default function C() {
  useWakeLock(phase === 'live' || phase === 'calling');
  return (
      <footer className="relative z-10 flex items-start justify-center gap-4 px-4 pb-6">
        <Round label={phase === 'ended' ? 'Close' : 'End'} danger onClick={hangUp}>
        </Round>
      </footer>
  );
}
`;
const ROOM = `import { Mic } from 'lucide-react';
export default function R({ room, leaveLabel }) {
  const blocked = room.mediaOk === false; // note
  return (
    <div>
      <Ctl label={leaveLabel} caption="Leave" tone="danger">x</Ctl>
    </div>
  );
}
`;

function setup(crlf) {
  const d = fs.mkdtempSync(path.join(root, 'tmp-audio-'));
  dirs.push(d);
  const conv = (s) => (crlf ? s.replace(/\n/g, '\r\n') : s);
  const w = (rel, s) => { const f = path.join(d, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, conv(s)); };
  w('android/app/src/main/java/com/lifeos/app/MainActivity.java', MAIN);
  w('android/app/src/main/AndroidManifest.xml', MANIFEST);
  w('src/components/connect/call/CallScreen.jsx', CALL);
  w('src/components/meetings/room/RoomControls.jsx', ROOM);
  fs.mkdirSync(path.join(d, 'scripts'));
  fs.copyFileSync(script, path.join(d, 'scripts', 'apply-audio-patch.mjs'));
  fs.copyFileSync(path.join(root, 'scripts', 'AudioRoutePlugin.java.tpl'), path.join(d, 'scripts', 'AudioRoutePlugin.java.tpl'));
  return d;
}
const run = (d) => spawnSync(process.execPath, ['scripts/apply-audio-patch.mjs'], { cwd: d, encoding: 'utf8' });
const read = (d, rel) => fs.readFileSync(path.join(d, rel), 'utf8');

for (const crlf of [false, true]) {
  test(`patch applies once and is repeatable (${crlf ? 'CRLF' : 'LF'})`, () => {
    const d = setup(crlf);
    const r1 = run(d);
    assert.equal(r1.status, 0, r1.stdout + r1.stderr);
    const main = read(d, 'android/app/src/main/java/com/lifeos/app/MainActivity.java');
    assert.ok(main.indexOf('registerPlugin(AudioRoutePlugin.class)') < main.indexOf('super.onCreate'));
    const plugin = read(d, 'android/app/src/main/java/com/lifeos/app/AudioRoutePlugin.java');
    assert.ok(plugin.includes('package com.lifeos.app;') && !plugin.includes('__PACKAGE__'));
    assert.match(read(d, 'android/app/src/main/AndroidManifest.xml'), /BLUETOOTH_CONNECT/);
    const call = read(d, 'src/components/connect/call/CallScreen.jsx');
    assert.match(call, /<AudioRouteControl audio=\{audio\} variant="round"/);
    assert.match(call, /flex-wrap items-start justify-center gap-x-4/);
    assert.match(read(d, 'src/components/meetings/room/RoomControls.jsx'), /variant="bar"/);
    if (crlf) for (const f of ['src/components/connect/call/CallScreen.jsx', 'src/components/meetings/room/RoomControls.jsx', 'android/app/src/main/java/com/lifeos/app/MainActivity.java']) assert.ok(!/[^\r]\n/.test(read(d, f)), `mixed line endings in ${f}`);
    const before = ['src/components/connect/call/CallScreen.jsx', 'android/app/src/main/AndroidManifest.xml'].map((f) => read(d, f));
    const r2 = run(d);
    assert.equal(r2.status, 0);
    assert.equal((r2.stdout.match(/nothing to do/g) || []).length, 5);
    assert.deepEqual(['src/components/connect/call/CallScreen.jsx', 'android/app/src/main/AndroidManifest.xml'].map((f) => read(d, f)), before);
  });
}

test('warns and leaves a file alone when its anchor is missing', () => {
  const d = setup(false);
  fs.writeFileSync(path.join(d, 'src/components/meetings/room/RoomControls.jsx'), 'export default function R(){return null}\n');
  const r = run(d);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /WARNING/);
  assert.equal(read(d, 'src/components/meetings/room/RoomControls.jsx'), 'export default function R(){return null}\n');
});
