import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const clientDir = fileURLToPath(new URL('..', import.meta.url));
const script = path.join(clientDir, 'scripts', 'apply-launch-patch.mjs');
const res = path.join(clientDir, 'android', 'app', 'src', 'main', 'res');
const made = [];
after(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const STYLES = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.DayNight.DarkActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
    </style>
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
    </style>
</resources>
`;
function setup(text, eol) {
  const dir = fs.mkdtempSync(path.join(clientDir, '.tmp-launch-')); made.push(dir);
  const f = path.join(dir, 'android/app/src/main/res/values/styles.xml');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text.replace(/\n/g, eol));
  return { dir, f };
}
const run = (dir) => spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });

for (const [name, eol] of [['LF', '\n'], ['CRLF', '\r\n']]) {
  test(`styles.xml is patched once (${name}) and a second run changes nothing`, () => {
    const { dir, f } = setup(STYLES, eol);
    const r1 = run(dir);
    assert.equal(r1.status, 0, r1.stderr);
    assert.match(r1.stdout, /patched/);
    const out = fs.readFileSync(f, 'utf8');
    assert.match(out, /@drawable\/launch_screen/);
    assert.ok(!out.includes('@drawable/splash<'), 'old splash reference is gone');
    assert.match(out, /windowSplashScreenBackground">#000000</);
    assert.match(out, /windowSplashScreenAnimatedIcon">@mipmap\/ic_launcher_foreground</);
    assert.match(out, /AppTheme"[^>]*DarkActionBar/, 'the other styles are untouched');
    if (eol === '\r\n') assert.ok(!/[^\r]\n/.test(out)); else assert.ok(!out.includes('\r'));
    assert.match(run(dir).stdout, /nothing to do/);
    assert.equal(fs.readFileSync(f, 'utf8'), out);
  });
}
test('an unexpected styles.xml is left alone with a warning', () => {
  const { dir, f } = setup('<resources></resources>\n', '\n');
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /could not find/);
  assert.equal(fs.readFileSync(f, 'utf8'), '<resources></resources>\n');
});
test('refuses to run when there is no android folder', () => {
  const dir = fs.mkdtempSync(path.join(clientDir, '.tmp-launch-')); made.push(dir);
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not found/);
});

// The images that came in the zip have the sizes Android expects.
const png = (rel) => { const b = fs.readFileSync(path.join(res, rel)); assert.equal(b.toString('latin1', 1, 4), 'PNG', rel); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const exists = fs.existsSync(path.join(res, 'mipmap-xxxhdpi', 'ic_launcher.png')) && fs.existsSync(path.join(res, 'drawable-nodpi', 'launch_logo.png'));
test('icon and launch images have the right sizes', { skip: !exists && 'the Android project is not in this folder' }, () => {
  const d = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [name, k] of Object.entries(d)) {
    assert.deepEqual(png(`mipmap-${name}/ic_launcher.png`), [48 * k, 48 * k], name);
    assert.deepEqual(png(`mipmap-${name}/ic_launcher_round.png`), [48 * k, 48 * k], name);
    assert.deepEqual(png(`mipmap-${name}/ic_launcher_foreground.png`), [108 * k, 108 * k], name);
  }
  assert.deepEqual(png('drawable-nodpi/launch_logo.png'), [960, 960]);
  for (const f of ['mipmap-anydpi-v26/ic_launcher.xml', 'mipmap-anydpi-v26/ic_launcher_round.xml']) assert.match(fs.readFileSync(path.join(res, f), 'utf8'), /@mipmap\/ic_launcher_foreground/);
  assert.match(fs.readFileSync(path.join(res, 'values/ic_launcher_background.xml'), 'utf8'), /name="ic_launcher_background">#000000</);
  assert.match(fs.readFileSync(path.join(res, 'drawable/launch_screen.xml'), 'utf8'), /@drawable\/launch_logo/);
});
