#!/usr/bin/env node
/**
 * Run from the client folder (safe to run again):   node scripts/apply-launch-patch.mjs
 *
 * Makes the Android startup screen use the LifeOS logo. It changes ONE file:
 *   android/app/src/main/res/values/styles.xml
 * (the launch theme now points at @drawable/launch_screen and uses a black background and the LifeOS icon
 *  for the short system splash that Android 12 and newer show).
 * The icons and the logo images themselves come from the zip. Prints "patched", "nothing to do" or "WARNING".
 */
import fs from 'node:fs';
import path from 'node:path';

const rel = path.join('android', 'app', 'src', 'main', 'res', 'values', 'styles.xml');
const file = path.resolve(rel);
if (!fs.existsSync(file)) {
  console.warn(`WARNING: ${rel} not found. Run this inside the client folder, after "npx cap add android".`);
  process.exit(1);
}
const src = fs.readFileSync(file, 'utf8');
if (src.includes('@drawable/launch_screen')) {
  console.log('styles.xml: nothing to do');
  process.exit(0);
}
const anchor = /^([ \t]*)<item name="android:background">@drawable\/splash<\/item>/m;
if (!anchor.test(src)) {
  console.warn('WARNING: styles.xml: could not find the launch background line (@drawable/splash). Nothing was changed. Send me the file.');
  process.exit(1);
}
const nl = src.includes('\r\n') ? '\r\n' : '\n';
const out = src.replace(anchor, (m, indent) => [
  `${indent}<item name="android:background">@drawable/launch_screen</item>`,
  `${indent}<item name="windowSplashScreenBackground">#000000</item>`,
  `${indent}<item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>`,
].join(nl));
fs.writeFileSync(file, out);
console.log('styles.xml: patched');
