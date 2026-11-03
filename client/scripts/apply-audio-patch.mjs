#!/usr/bin/env node
/**
 * Run from the client folder (safe to run again):   node scripts/apply-audio-patch.mjs
 * Adds the sound-output button (Speaker / Phone / Bluetooth / Headset) to calls and meetings in the Android app.
 *  - android/.../AudioRoutePlugin.java   NEW (written from scripts/AudioRoutePlugin.java.tpl, next to MainActivity.java)
 *  - android/.../MainActivity.java       registers the plugin
 *  - android/app/src/main/AndroidManifest.xml  Bluetooth permission
 *  - src/components/connect/call/CallScreen.jsx   the button (and the button row may wrap to two lines)
 *  - src/components/meetings/room/RoomControls.jsx   the button
 * Prints "patched", "nothing to do" or "WARNING" per file; a file is written only if all its steps worked.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
let failed = false;

function edit(rel, steps) {
  const file = path.resolve(rel);
  if (!fs.existsSync(file)) { console.warn(`WARNING: ${rel} not found. Run this inside the client folder.`); failed = true; return; }
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

// ── Android native side ───────────────────────────────────────────────
function findMain(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { const hit = findMain(full); if (hit) return hit; } else if (e.name === 'MainActivity.java') return full;
  }
  return null;
}
const mainFile = findMain(path.resolve('android', 'app', 'src', 'main', 'java'));
if (!mainFile) { console.warn('WARNING: MainActivity.java not found. Run this inside the client folder, after "npx cap add android".'); failed = true; } else {
  const main = fs.readFileSync(mainFile, 'utf8');
  const pkg = main.match(/^\s*package\s+([\w.]+)\s*;/m)?.[1];
  const pluginFile = path.join(path.dirname(mainFile), 'AudioRoutePlugin.java');
  if (!pkg) { console.warn('WARNING: MainActivity.java has no package line; nothing changed there.'); failed = true; } else {
    if (fs.existsSync(pluginFile)) console.log('AudioRoutePlugin.java: nothing to do');
    else {
      const tpl = fs.readFileSync(path.join(here, 'AudioRoutePlugin.java.tpl'), 'utf8').replace(/__PACKAGE__/g, pkg);
      const nlm = main.includes('\r\n') ? '\r\n' : '\n';
      fs.writeFileSync(pluginFile, tpl.replace(/\r?\n/g, nlm));
      console.log('AudioRoutePlugin.java: created');
    }
    edit(path.relative(process.cwd(), mainFile), [{
      hint: 'super.onCreate(savedInstanceState); inside MainActivity (run the ringtone patch first: node scripts/apply-ringtone-patch.mjs)',
      done: (s) => s.includes('registerPlugin(AudioRoutePlugin.class)'),
      re: /^([ \t]*)super\.onCreate\(savedInstanceState\);/m,
      to: (m, nl) => `${m[1]}registerPlugin(AudioRoutePlugin.class); // before super.onCreate, as Capacitor requires${nl}${m[0]}`,
    }]);
  }
}

edit(path.join('android', 'app', 'src', 'main', 'AndroidManifest.xml'), [{
  hint: '<uses-permission android:name="android.permission.INTERNET" />',
  done: (s) => s.includes('android.permission.BLUETOOTH_CONNECT'),
  re: /^([ \t]*)(<uses-permission android:name="android\.permission\.INTERNET"\s*\/>)/m,
  to: (m, nl) => `${m[1]}${m[2]}${nl}${m[1]}<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />${nl}${m[1]}<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />`,
}]);

// ── the screens ───────────────────────────────────────────────────────
edit(path.join('src', 'components', 'connect', 'call', 'CallScreen.jsx'), [
  {
    hint: "the callState.js import",
    done: (s) => s.includes('AudioRouteControl'),
    re: /^(import \{[^}]*\} from '\.\.\/\.\.\/\.\.\/utils\/callState\.js';)(\r?)$/m,
    to: (m, nl) => `${m[1]}${m[2]}${nl}import AudioRouteControl from '../../../native/AudioRouteControl.jsx';${m[2]}${nl}import { useAudioRoute } from '../../../native/useAudioRoute.js';${m[2]}`,
  },
  {
    hint: 'the useWakeLock(...) line',
    done: (s) => s.includes('useAudioRoute('),
    re: /^([ \t]*)(useWakeLock\([^\n]*\);)(\r?)$/m,
    to: (m, nl) => `${m[1]}${m[2]}${m[3]}${nl}${m[1]}const audio = useAudioRoute(phase === 'live' || phase === 'calling' || phase === 'reconnecting'); // Android app: loudspeaker / Bluetooth${m[3]}`,
  },
  {
    hint: "the End / Close button",
    done: (s) => s.includes('<AudioRouteControl'),
    re: /^([ \t]*)(<Round label=\{phase === 'ended' \? 'Close' : 'End'\})/m,
    to: (m, nl) => `${m[1]}{audio.supported && phase !== 'ended' && <AudioRouteControl audio={audio} variant="round" />}${nl}${m[0]}`,
  },
  {
    hint: 'the button row (<footer ... flex items-start justify-center gap-4 ...>)',
    done: (s) => s.includes('flex flex-wrap items-start justify-center gap-x-4'),
    re: /(<footer className="relative z-10 )flex items-start justify-center gap-4/,
    to: (m) => `${m[1]}flex flex-wrap items-start justify-center gap-x-4 gap-y-3`,
  },
]);

edit(path.join('src', 'components', 'meetings', 'room', 'RoomControls.jsx'), [
  {
    hint: "the lucide-react import",
    done: (s) => s.includes('AudioRouteControl'),
    re: /^(import \{[^}]*\} from 'lucide-react';)(\r?)$/m,
    to: (m, nl) => `${m[1]}${m[2]}${nl}import AudioRouteControl from '../../../native/AudioRouteControl.jsx';${m[2]}${nl}import { useAudioRoute } from '../../../native/useAudioRoute.js';${m[2]}`,
  },
  {
    hint: 'const blocked = room.mediaOk === false; inside RoomControls',
    done: (s) => s.includes('useAudioRoute('),
    re: /^([ \t]*)(const blocked = room\.mediaOk === false;[^\n]*?)(\r?)$/m,
    to: (m, nl) => `${m[1]}${m[2]}${m[3]}${nl}${m[1]}const audio = useAudioRoute(room.status === 'connected'); // Android app: loudspeaker / Bluetooth${m[3]}`,
  },
  {
    hint: 'the Leave control',
    done: (s) => s.includes('<AudioRouteControl'),
    re: /^([ \t]*)(<Ctl label=\{leaveLabel\})/m,
    to: (m, nl) => `${m[1]}{audio.supported && <AudioRouteControl audio={audio} variant="bar" />}${nl}${m[0]}`,
  },
]);

process.exit(failed ? 1 : 0);
