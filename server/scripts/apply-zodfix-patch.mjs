#!/usr/bin/env node
/**
 * Run from the server folder (safe to run again):   node scripts/apply-zodfix-patch.mjs
 *
 * Fixes two problems found when the whole test suite was run on your computer:
 *  1. src/utils/life.logic.js  - with the newer zod on your computer, editing ONE field of a My life area or a
 *     knowledge entry (for example only the name) silently reset the other fields to their defaults
 *     (target minutes to 0, automatic sources emptied, tags, link, note and pinned cleared).
 *     The edit (PATCH) schemas are now built without defaults, so only what you send is changed.
 *  2. test/life.service.test.mjs - the test built a wrong path on Windows ("P:\P:\..."); it now uses fileURLToPath.
 * Prints "patched", "nothing to do" or "WARNING" per file. A file is written only if all its steps work.
 */
import fs from 'node:fs';
import path from 'node:path';

let failed = false;
function edit(rel, steps) {
  const file = path.resolve(rel);
  if (!fs.existsSync(file)) { console.warn(`WARNING: ${rel} not found. Run this inside the server folder.`); failed = true; return; }
  let src = fs.readFileSync(file, 'utf8');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const L = (t) => t.replace(/\n/g, eol);
  let changed = false; let bad = false;
  for (const s of steps) {
    if (s.done(src)) { console.log(`${rel} - ${s.name}: nothing to do`); continue; }
    if (!s.re.test(src)) { console.warn(`WARNING: ${rel} - ${s.name}: could not find the place to change.`); bad = true; continue; }
    src = src.replace(s.re, (...m) => L(s.to(...m)));
    console.log(`${rel} - ${s.name}: patched`); changed = true;
  }
  if (bad) { failed = true; console.warn(`WARNING: ${rel} was NOT written.`); } else if (changed) fs.writeFileSync(file, src);
}

edit('src/utils/life.logic.js', [
  {
    name: 'area schema',
    done: (s) => s.includes('const areaFields = {'),
    re: /export const areaSchema = z\.object\(\{[\s\S]*?\r?\n\}\);\r?\nexport const areaPatchSchema = [^\n]*\r?\n/,
    to: () => `const areaFields = {
  name: z.string().trim().min(1).max(40),
  targetMinutes: z.number().int().min(0).max(LIMITS.maxTarget),
  // Where this area also gets time from, automatically. Both are chosen by the person.
  taskCategories: z.array(z.string().trim().min(1).max(40)).max(10),
  eventTypes: z.array(z.enum(EVENT_TYPES)).max(8),
};
export const areaSchema = z.object({
  name: areaFields.name,
  targetMinutes: areaFields.targetMinutes.optional().default(0),
  taskCategories: areaFields.taskCategories.optional().default([]),
  eventTypes: areaFields.eventTypes.optional().default([]),
});
// The edit schema has NO defaults, so a change to one field never resets the others.
export const areaPatchSchema = z.object(areaFields).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to change');
`,
  },
  {
    name: 'entry schema',
    done: (s) => s.includes('const entryFields = {'),
    re: /export const entrySchema = z\.object\(\{[\s\S]*?\r?\n\}\);\r?\nexport const entryPatchSchema = [^\n]*\r?\n/,
    to: () => `const entryFields = {
  kind: z.enum(KINDS),
  title: z.string().trim().min(1).max(LIMITS.title),
  body: z.string().trim().max(LIMITS.body),
  url: z.string().trim().max(LIMITS.url),
  tags: z.array(z.string()).max(20),
  pinned: z.boolean(),
};
export const entrySchema = z.object({
  kind: entryFields.kind,
  title: entryFields.title,
  body: entryFields.body.optional().default(''),
  url: entryFields.url.optional().default(''),
  tags: entryFields.tags.optional().default([]),
  pinned: entryFields.pinned.optional().default(false),
});
// The edit schema has NO defaults, so a change to one field never resets the others.
export const entryPatchSchema = z.object(entryFields).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to change');
`,
  },
]);

edit('test/life.service.test.mjs', [
  {
    name: 'Windows path',
    done: (s) => s.includes('fileURLToPath'),
    re: /const src = path\.resolve\(new URL\('\.\.\/src', import\.meta\.url\)\.pathname\);/,
    to: () => "const src = path.resolve(fileURLToPath(new URL('../src', import.meta.url)));",
  },
  {
    name: 'import fileURLToPath',
    done: (s) => /import \{[^}]*fileURLToPath[^}]*\} from 'node:url'/.test(s),
    re: /(import os from 'node:os';)/,
    to: (full, g1) => `${g1}\nimport { fileURLToPath } from 'node:url';`,
  },
]);
process.exit(failed ? 1 : 0);
