import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = [];
after(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const CALL = `export default function C() {
  const audio = useAudioRoute(phase === 'live' || phase === 'calling' || phase === 'reconnecting'); // Android app
  const status = phase === 'live' ? formatDuration(seconds) : phase === 'ended' ? endedText(everConnected) : phaseText(phase, { group: meta.group });
  return (
    <div>
          {remotes.length <= 1 ? (
            <Face name={headline} group={meta.group && remotes.length === 0} speaking={Boolean(remotes[0]?.isSpeaking)} />
          ) : null}
    </div>
  );
}
`;
const MAIN = 'package com.lifeos.app;\npublic class MainActivity {}\n';

function setup(crlf, oldPlugin = true) {
  const d = fs.mkdtempSync(path.join(root, 'tmp-v2-'));
  dirs.push(d);
  const conv = (s) => (crlf ? s.replace(/\n/g, '\r\n') : s);
  const w = (rel, s) => { const f = path.join(d, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
  w('android/app/src/main/java/com/lifeos/app/MainActivity.java', conv(MAIN));
  if (oldPlugin) w('android/app/src/main/java/com/lifeos/app/AudioRoutePlugin.java', 'package com.lifeos.app;\n// old version\n');
  w('src/components/connect/call/CallScreen.jsx', conv(CALL));
  for (const f of ['apply-audio-route-v2-patch.mjs', 'AudioRoutePlugin.java.tpl']) w(`scripts/${f}`, fs.readFileSync(path.join(root, 'scripts', f), 'utf8'));
  return d;
}
const run = (d) => spawnSync(process.execPath, ['scripts/apply-audio-route-v2-patch.mjs'], { cwd: d, encoding: 'utf8' });
const read = (d, rel) => fs.readFileSync(path.join(d, rel), 'utf8');

for (const crlf of [false, true]) {
  test(`v2 patch (${crlf ? 'CRLF' : 'LF'})`, () => {
    const d = setup(crlf);
    const r = run(d);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const plugin = read(d, 'android/app/src/main/java/com/lifeos/app/AudioRoutePlugin.java');
    assert.ok(plugin.includes('audio-route v2') && plugin.includes('package com.lifeos.app;') && !plugin.includes('__PACKAGE__'));
    const call = read(d, 'src/components/connect/call/CallScreen.jsx');
    assert.match(call, /\{ video: modeHint === 'video' \}/);
    assert.match(call, /phase === 'calling' \? 'Ringing…' : phaseText/);
    assert.match(call, /data-ring/);
    if (crlf) assert.ok(!/[^\r]\n/.test(call), 'mixed line endings');
    const again = run(d);
    assert.equal(again.status, 0);
    assert.equal((again.stdout.match(/nothing to do/g) || []).length, 2);
    assert.equal(read(d, 'src/components/connect/call/CallScreen.jsx'), call);
  });
}

test('warns and changes nothing when the first audio patch was not applied', () => {
  const d = setup(false);
  fs.writeFileSync(path.join(d, 'src/components/connect/call/CallScreen.jsx'), 'export default function C(){return null}\n');
  const r = run(d);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /WARNING/);
  assert.equal(read(d, 'src/components/connect/call/CallScreen.jsx'), 'export default function C(){return null}\n');
});
