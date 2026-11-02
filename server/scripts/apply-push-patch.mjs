#!/usr/bin/env node
/**
 * Run from the server folder (safe to run again):   node scripts/apply-push-patch.mjs
 * Changes src/services/connectCall.service.js only: when a call starts, every invited person's Android app is rung
 * (in addition to the existing web notification). Prints "patched", "nothing to do" or "WARNING".
 */
import fs from 'node:fs';
import path from 'node:path';

const rel = path.join('src', 'services', 'connectCall.service.js');
const file = path.resolve(rel);
if (!fs.existsSync(file)) { console.warn(`WARNING: ${rel} not found. Run this inside the server folder.`); process.exit(1); }
let src = fs.readFileSync(file, 'utf8');
const nl = src.includes('\r\n') ? '\r\n' : '\n';
if (src.includes('sendCallPush')) { console.log('connectCall.service.js: nothing to do'); process.exit(0); }
const imp = /^import \{ pushToUser \} from '\.\/push\.service\.js';\r?$/m;
const use = /^([ \t]*)membersOf\(conv\)\.filter\(\(m\) => m !== String\(me\)\)\.forEach\(\(m\) => pushToUser\(m, \{ title: `\$\{callerName\} is calling`[^\n]*\r?\n/m;
if (!imp.test(src) || !use.test(src)) {
  console.warn('WARNING: connectCall.service.js: could not find the push import or the "is calling" push line. Nothing was changed. Send me the file.');
  process.exit(1);
}
src = src.replace(imp, (m) => `${m.replace(/\r$/, '')}${nl}import { sendCallPush } from './fcm.service.js';${m.endsWith('\r') ? '\r' : ''}`);
src = src.replace(use, (line, indent) => `${line}${indent}// The Android app, even when it is closed.${nl}${indent}membersOf(conv).filter((m) => m !== String(me)).forEach((m) => { sendCallPush(m, { title: \`\${callerName} is calling\`, body: call.mode === 'video' ? 'Incoming video call' : 'Incoming voice call', callId: String(call._id) }); });${nl}`);
fs.writeFileSync(file, src);
console.log('connectCall.service.js: patched');
