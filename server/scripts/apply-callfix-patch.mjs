#!/usr/bin/env node
/**
 * Server half of the incoming-call fix. Run from the server folder (safe to run again):
 *   node scripts/apply-callfix-patch.mjs
 *
 * Changes server/src/services/connectCall.service.js: every call sent to the app now also says how many
 * milliseconds of ringing are LEFT, measured on the server's clock ("ringLeftMs"). The app uses that instead of
 * comparing the server's clock with the phone's clock, which hid the call screen at once on a phone with a wrong time.
 * Prints "patched", "nothing to do" or "WARNING".
 */
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src', 'services', 'connectCall.service.js');
if (!fs.existsSync(file)) {
  console.warn(`WARNING: ${file} not found. Run this from the server folder.`);
  process.exit(1);
}
const src = fs.readFileSync(file, 'utf8');
if (src.includes('ringLeftMs')) {
  console.log('connectCall.service.js: nothing to do');
  process.exit(0);
}
const anchor = /^([ \t]*)ringingUntil: new Date\(new Date\(call\.createdAt\)\.getTime\(\) \+ RING_MS\),(\r?\n)/m;
if (!anchor.test(src)) {
  console.warn('WARNING: could not find the "ringingUntil" line in toDto(). Nothing was changed.');
  process.exit(1);
}
const out = src.replace(
  anchor,
  (line, indent, nl) => `${line}${indent}ringLeftMs: Math.max(0, new Date(call.createdAt).getTime() + RING_MS - Date.now()), // ringing time left, on the server's clock${nl}`
);
fs.writeFileSync(file, out);
console.log('connectCall.service.js: patched');
