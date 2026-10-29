#!/usr/bin/env node
/**
 * Run ONCE after `npx cap add android` (safe to run again).
 *
 *   node scripts/apply-android-patch.mjs            (from the client folder)
 *   node scripts/apply-android-patch.mjs <android-folder>   (only if the folder is not ./android)
 *
 * It changes two files that Capacitor generated inside the android folder:
 *   1. AndroidManifest.xml  - adds camera / microphone / audio permissions (meetings need them) and marks the
 *                             camera and microphone as OPTIONAL hardware, so phones without one can still install.
 *   2. MainActivity.java    - tells the Android web view to accept cookies from your server (Render), because
 *                             the site (Netlify) and the server live on different addresses.
 * It prints "patched", "nothing to do" or "WARNING" for each file.
 */
import fs from 'node:fs';
import path from 'node:path';

const androidDir = path.resolve(process.argv[2] || 'android');

const PERMISSIONS = [
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.ACCESS_NETWORK_STATE',
];
const FEATURES = ['android.hardware.camera', 'android.hardware.microphone'];

function patchManifest() {
  const file = path.join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml');
  if (!fs.existsSync(file)) {
    console.warn(`WARNING: ${file} not found. Run "npx cap add android" first.`);
    return false;
  }
  const src = fs.readFileSync(file, 'utf8');
  const nl = src.includes('\r\n') ? '\r\n' : '\n';
  const lines = [];
  for (const p of PERMISSIONS) {
    if (!src.includes(`android:name="${p}"`)) lines.push(`    <uses-permission android:name="${p}" />`);
  }
  for (const f of FEATURES) {
    if (!src.includes(`android:name="${f}"`)) {
      lines.push(`    <uses-feature android:name="${f}" android:required="false" />`);
    }
  }
  if (!lines.length) {
    console.log('AndroidManifest.xml: nothing to do');
    return true;
  }
  if (!/<\/manifest>/.test(src)) {
    console.warn('WARNING: AndroidManifest.xml has no closing </manifest> tag; left unchanged.');
    return false;
  }
  const out = src.replace(/(\r?\n)?[ \t]*<\/manifest>/, `${nl}${lines.join(nl)}${nl}</manifest>`);
  fs.writeFileSync(file, out);
  console.log('AndroidManifest.xml: patched');
  return true;
}

function findMainActivity(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = findMainActivity(full);
      if (hit) return hit;
    } else if (entry.name === 'MainActivity.java') {
      return full;
    }
  }
  return null;
}

function patchMainActivity() {
  const file = findMainActivity(path.join(androidDir, 'app', 'src', 'main', 'java'));
  if (!file) {
    console.warn('WARNING: MainActivity.java not found. Run "npx cap add android" first.');
    return false;
  }
  const src = fs.readFileSync(file, 'utf8');
  if (src.includes('setAcceptThirdPartyCookies')) {
    console.log('MainActivity.java: nothing to do');
    return true;
  }
  const pkg = src.match(/^\s*package\s+([\w.]+)\s*;/m);
  if (!pkg) {
    console.warn('WARNING: MainActivity.java has no package line; left unchanged.');
    return false;
  }
  const nl = src.includes('\r\n') ? '\r\n' : '\n';
  const code = `package ${pkg[1]};

import android.webkit.CookieManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onStart() {
    super.onStart();
    // The site (Netlify) and the API (Render) have different addresses, so the login cookie counts as a
    // third-party cookie. Allow it explicitly so signing in works inside the app.
    WebView webView = getBridge().getWebView();
    CookieManager cookies = CookieManager.getInstance();
    cookies.setAcceptCookie(true);
    cookies.setAcceptThirdPartyCookies(webView, true);
  }
}
`;
  fs.writeFileSync(file, code.replace(/\n/g, nl));
  console.log('MainActivity.java: patched');
  return true;
}

const a = patchManifest();
const b = patchMainActivity();
process.exit(a && b ? 0 : 1);
