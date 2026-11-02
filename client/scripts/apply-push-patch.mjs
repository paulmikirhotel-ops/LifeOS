#!/usr/bin/env node
/**
 * Run from the client folder (safe to run again):   node scripts/apply-push-patch.mjs
 * 1. src/layouts/AppLayout.jsx - calls useNativePush(user) so the Android app registers for call alerts.
 * 2. android/app/src/main/AndroidManifest.xml - adds the notification permission (needed on Android 13 and newer).
 * Prints "patched", "nothing to do" or "WARNING" per file; a file is written only if its step worked.
 */
import fs from 'node:fs';
import path from 'node:path';

let failed = false;
function edit(rel, steps) {
  const file = path.resolve(rel);
  if (!fs.existsSync(file)) { console.warn(`WARNING: ${rel} not found. Run this inside the client folder${rel.startsWith('android') ? ', after "npx cap add android"' : ''}.`); failed = true; return; }
  let src = fs.readFileSync(file, 'utf8');
  const nl = src.includes('\r\n') ? '\r\n' : '\n';
  let changed = false; let bad = false;
  for (const s of steps) {
    if (s.done(src)) continue;
    if (!s.re.test(src)) { console.warn(`WARNING: ${rel}: could not find the place for: ${s.hint}`); bad = true; continue; }
    src = src.replace(s.re, (...m) => s.to(m, nl)); changed = true;
  }
  if (bad) { failed = true; console.warn(`WARNING: ${rel} was NOT changed.`); return; }
  if (changed) { fs.writeFileSync(file, src); console.log(`patched ${rel}`); } else console.log(`${rel}: nothing to do`);
}

edit(path.join('src', 'layouts', 'AppLayout.jsx'), [
  {
    hint: "the useAuth import",
    done: (s) => s.includes('useNativePush'),
    re: /^(import \{[^}]*\buseAuth\b[^}]*\} from '[^']*AuthContext\.jsx';)(\r?)$/m,
    to: (m, nl) => `${m[1]}${m[2]}${nl}import { useNativePush } from '../hooks/useNativePush.js';${m[2]}`,
  },
  {
    hint: 'const { user, ... } = useAuth(); inside the layout component',
    done: (s) => /useNativePush\(user\)/.test(s),
    re: /^([ \t]*)(const \{[^}]*\buser\b[^}]*\} = useAuth\(\);)/m,
    to: (m, nl) => `${m[1]}${m[2]}${nl}${m[1]}useNativePush(user); // Android app: register this phone for call alerts`,
  },
]);

edit(path.join('android', 'app', 'src', 'main', 'AndroidManifest.xml'), [
  {
    hint: '<uses-permission android:name="android.permission.INTERNET" />',
    done: (s) => s.includes('android.permission.POST_NOTIFICATIONS'),
    re: /^([ \t]*)(<uses-permission android:name="android\.permission\.INTERNET"\s*\/>)/m,
    to: (m, nl) => `${m[1]}${m[2]}${nl}${m[1]}<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />${nl}${m[1]}<uses-permission android:name="android.permission.VIBRATE" />`,
  },
]);
process.exit(failed ? 1 : 0);
