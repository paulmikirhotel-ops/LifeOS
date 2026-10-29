import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, '..', 'scripts', 'apply-android-patch.mjs');
const config = path.join(here, '..', 'capacitor.config.json');

function fakeAndroid(crlf) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-android-'));
  const nl = crlf ? '\r\n' : '\n';
  const main = path.join(root, 'app', 'src', 'main');
  fs.mkdirSync(path.join(main, 'java', 'com', 'lifeos', 'app'), { recursive: true });
  fs.writeFileSync(
    path.join(main, 'AndroidManifest.xml'),
    ['<?xml version="1.0" encoding="utf-8" ?>', '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
      '    <application android:label="LifeOS"></application>',
      '    <uses-permission android:name="android.permission.INTERNET" />', '</manifest>', ''].join(nl)
  );
  fs.writeFileSync(
    path.join(main, 'java', 'com', 'lifeos', 'app', 'MainActivity.java'),
    ['package com.lifeos.app;', '', 'import com.getcapacitor.BridgeActivity;', '',
      'public class MainActivity extends BridgeActivity {}', ''].join(nl)
  );
  return root;
}

function run(dir) {
  return spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
}

for (const crlf of [false, true]) {
  test(`patches manifest and MainActivity, then does nothing on re-run (${crlf ? 'CRLF' : 'LF'})`, () => {
    const dir = fakeAndroid(crlf);
    try {
      const first = run(dir);
      assert.equal(first.status, 0, first.stderr);
      assert.match(first.stdout, /AndroidManifest\.xml: patched/);
      assert.match(first.stdout, /MainActivity\.java: patched/);

      const manifest = fs.readFileSync(path.join(dir, 'app/src/main/AndroidManifest.xml'), 'utf8');
      for (const p of ['CAMERA', 'RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'ACCESS_NETWORK_STATE']) {
        assert.ok(manifest.includes(`android.permission.${p}`), p);
      }
      assert.match(manifest, /android.hardware.camera"\s+android:required="false"/);
      assert.match(manifest, /android.hardware.microphone"\s+android:required="false"/);
      assert.ok(manifest.includes('android.permission.INTERNET'), 'existing permission kept');
      assert.ok(manifest.trim().endsWith('</manifest>'));
      if (crlf) assert.ok(!/[^\r]\n/.test(manifest), 'no bare LF in a CRLF file');

      const java = fs.readFileSync(path.join(dir, 'app/src/main/java/com/lifeos/app/MainActivity.java'), 'utf8');
      assert.match(java, /package com\.lifeos\.app;/);
      assert.match(java, /setAcceptThirdPartyCookies\(webView, true\)/);
      assert.match(java, /extends BridgeActivity/);

      const second = run(dir);
      assert.equal(second.status, 0, second.stderr);
      assert.match(second.stdout, /AndroidManifest\.xml: nothing to do/);
      assert.match(second.stdout, /MainActivity\.java: nothing to do/);
      const again = fs.readFileSync(path.join(dir, 'app/src/main/AndroidManifest.xml'), 'utf8');
      assert.equal(again, manifest, 'second run does not change the manifest');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('warns and exits with an error when the android folder does not exist', () => {
  const r = run(path.join(os.tmpdir(), 'lifeos-no-such-android-folder'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /WARNING/);
});

test('capacitor.config.json is valid and points at the live site', () => {
  const cfg = JSON.parse(fs.readFileSync(config, 'utf8'));
  assert.equal(cfg.appId, 'com.lifeos.app');
  assert.equal(cfg.appName, 'LifeOS');
  assert.equal(cfg.webDir, 'mobile-www');
  assert.equal(cfg.server.url, 'https://lifepilot-os.netlify.app');
  assert.equal(cfg.server.cleartext, false);
  assert.ok(fs.existsSync(path.join(here, '..', cfg.webDir, cfg.server.errorPath)), 'offline page exists');
  assert.ok(fs.existsSync(path.join(here, '..', cfg.webDir, 'index.html')));
});
