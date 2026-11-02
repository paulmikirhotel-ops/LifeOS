import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const clientDir = fileURLToPath(new URL('..', import.meta.url));
const script = path.join(clientDir, 'scripts', 'apply-ringtone-patch.mjs');
const made = [];
after(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const MAIN = `package com.lifeos.app;

import android.webkit.CookieManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onStart() {
    super.onStart();
    WebView webView = getBridge().getWebView();
  }
}
`;
function setup(eol, text = MAIN) {
  const dir = fs.mkdtempSync(path.join(clientDir, '.tmp-ring-')); made.push(dir);
  const f = path.join(dir, 'android/app/src/main/java/com/lifeos/app/MainActivity.java');
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text.replace(/\n/g, eol));
  return { dir, f };
}
const run = (dir) => spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
for (const [name, eol] of [['LF', '\n'], ['CRLF', '\r\n']]) {
  test(`ringtone patch (${name}): channel added once, existing code kept, braces balance`, () => {
    const { dir, f } = setup(eol);
    const r = run(dir); assert.equal(r.status, 0, r.stderr);
    const out = fs.readFileSync(f, 'utf8');
    assert.match(out, /"calls_ring"/); assert.match(out, /TYPE_RINGTONE/); assert.match(out, /USAGE_NOTIFICATION_RINGTONE/); assert.match(out, /IMPORTANCE_HIGH/);
    assert.match(out, /public void onStart\(\)/, 'the cookie code is still there');
    assert.equal((out.match(/createCallChannel\(\)/g) || []).length, 2);
    assert.equal((out.match(/\{/g) || []).length, (out.match(/\}/g) || []).length);
    assert.ok(out.indexOf('onCreate') < out.indexOf('onStart'));
    if (eol === '\r\n') assert.ok(!/[^\r]\n/.test(out)); else assert.ok(!out.includes('\r'));
    assert.match(run(dir).stdout, /nothing to do/);
    assert.equal(fs.readFileSync(f, 'utf8'), out);
  });
}
test('an unexpected MainActivity is left alone', () => {
  const { dir, f } = setup('\n', 'package x;\nclass MainActivity {}\n');
  const r = run(dir); assert.equal(r.status, 1); assert.match(r.stderr, /could not find/);
  assert.equal(fs.readFileSync(f, 'utf8'), 'package x;\nclass MainActivity {}\n');
});
