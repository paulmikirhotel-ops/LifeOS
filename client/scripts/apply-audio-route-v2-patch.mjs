#!/usr/bin/env node
/**
 * Run from the client folder (safe to run again):   node scripts/apply-audio-route-v2-patch.mjs
 * Second step of the call audio work. Run it AFTER scripts/apply-audio-patch.mjs.
 *  - AudioRoutePlugin.java (android) is replaced by the new version: voice calls start on the earpiece, video calls on the loudspeaker.
 *  - CallScreen.jsx: tells the audio part whether it is a video call; the caller sees "Ringing…" with an animated ring while the other phone rings.
 * Prints "patched", "nothing to do" or "WARNING" per file; a file is written only if all its steps worked.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
let failed = false;

function findMain(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { const hit = findMain(full); if (hit) return hit; } else if (e.name === 'MainActivity.java') return full;
  }
  return null;
}

const mainFile = findMain(path.resolve('android', 'app', 'src', 'main', 'java'));
if (!mainFile) { console.warn('WARNING: MainActivity.java not found. Run this inside the client folder.'); failed = true; } else {
  const main = fs.readFileSync(mainFile, 'utf8');
  const pkg = main.match(/^\s*package\s+([\w.]+)\s*;/m)?.[1];
  const pluginFile = path.join(path.dirname(mainFile), 'AudioRoutePlugin.java');
  if (!pkg) { console.warn('WARNING: MainActivity.java has no package line.'); failed = true; }
  else if (fs.existsSync(pluginFile) && fs.readFileSync(pluginFile, 'utf8').includes('audio-route v2')) console.log('AudioRoutePlugin.java: nothing to do');
  else {
    const nl = main.includes('\r\n') ? '\r\n' : '\n';
    const tpl = fs.readFileSync(path.join(here, 'AudioRoutePlugin.java.tpl'), 'utf8').replace(/__PACKAGE__/g, pkg);
    fs.writeFileSync(pluginFile, tpl.replace(/\r?\n/g, nl));
    console.log('patched AudioRoutePlugin.java');
  }
}

const rel = path.join('src', 'components', 'connect', 'call', 'CallScreen.jsx');
const file = path.resolve(rel);
if (!fs.existsSync(file)) { console.warn(`WARNING: ${rel} not found.`); failed = true; } else {
  let src = fs.readFileSync(file, 'utf8');
  const nl = src.includes('\r\n') ? '\r\n' : '\n';
  const steps = [
    {
      hint: 'const audio = useAudioRoute(...) (run scripts/apply-audio-patch.mjs first)',
      done: (s) => s.includes("{ video: modeHint === 'video' }"),
      re: /(const audio = useAudioRoute\(phase === 'live' \|\| phase === 'calling' \|\| phase === 'reconnecting')\)/,
      to: (m) => `${m[1]}, { video: modeHint === 'video' })`,
    },
    {
      hint: 'the status text (phaseText(phase, { group: meta.group }))',
      done: (s) => s.includes("phase === 'calling' ? 'Ringing…'"),
      re: /: phaseText\(phase, \{ group: meta\.group \}\);/,
      to: () => ": phase === 'calling' ? 'Ringing…' : phaseText(phase, { group: meta.group });",
    },
    {
      hint: 'the big picture <Face name={headline} ... />',
      done: (s) => s.includes('data-ring'),
      re: /^([ \t]*)(<Face name=\{headline\} group=\{meta\.group && remotes\.length === 0\} speaking=\{Boolean\(remotes\[0\]\?\.isSpeaking\)\} \/>)(\r?)$/m,
      to: (m, nl2) => [
        `${m[1]}<span className="relative isolate inline-flex" data-ring={phase === 'calling' ? 'on' : undefined}>`,
        `${m[1]}  {phase === 'calling' && (`,
        `${m[1]}    <>`,
        `${m[1]}      <span aria-hidden="true" className="absolute inset-0 -z-10 animate-ping rounded-full bg-white/25" />`,
        `${m[1]}      <span aria-hidden="true" className="absolute -inset-4 -z-10 animate-pulse rounded-full ring-2 ring-white/25" />`,
        `${m[1]}    </>`,
        `${m[1]}  )}`,
        `${m[1]}  ${m[2]}`,
        `${m[1]}</span>`,
      ].join(`${m[3]}${nl2}`) + m[3],
    },
  ];
  let changed = false; let bad = false;
  for (const s of steps) {
    if (s.done(src)) continue;
    if (!s.re.test(src)) { console.warn(`WARNING: ${rel}: could not find the place for: ${s.hint}`); bad = true; continue; }
    src = src.replace(s.re, (...m) => s.to(m, nl)); changed = true;
  }
  if (bad) { failed = true; console.warn(`WARNING: ${rel} was NOT changed.`); }
  else if (changed) { fs.writeFileSync(file, src); console.log(`patched ${rel}`); } else console.log(`${rel}: nothing to do`);
}
process.exit(failed ? 1 : 0);
