// Run from the server folder:  node scripts/apply-offline-patch.mjs
// Turns on retry protection (Idempotency-Key) for every write in the API. Safe to run twice.
import fs from 'node:fs';
import path from 'node:path';

const rel = 'src/routes/index.js';
const file = path.resolve(rel);
if (!fs.existsSync(file)) { console.log(`WARNING: ${rel} not found. Run this inside the server folder.`); process.exit(1); }
let src = fs.readFileSync(file, 'utf8');
const eol = src.includes('\r\n') ? '\r\n' : '\n';
let changed = false;

if (!src.includes('middleware/idempotency.js')) {
  const re = /(import \{ Router \} from 'express';)/;
  if (re.test(src)) { src = src.replace(re, `$1${eol}import idempotency from '../middleware/idempotency.js';`); changed = true; }
  else console.log("WARNING: could not add the import line in src/routes/index.js");
}
if (!/router\.use\(idempotency\)/.test(src)) {
  const re = /(const router = Router\(\);)/;
  if (re.test(src)) { src = src.replace(re, `$1${eol}// Retry protection for the phone's offline queue: a repeated write with the same key runs only once.${eol}router.use(idempotency);`); changed = true; }
  else console.log('WARNING: could not find "const router = Router();" in src/routes/index.js');
}
if (changed) { fs.writeFileSync(file, src); console.log(`patched ${rel}`); } else console.log(`${rel}: nothing to do`);

// CORS must let the browser send the Idempotency-Key header.
const hits = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { if (f.name !== 'node_modules') walk(p); } else if (/\.js$/.test(f.name)) {
      const t = fs.readFileSync(p, 'utf8');
      if (/allowedHeaders/.test(t)) hits.push(p);
    }
  }
})(path.resolve('src'));
if (hits.length) console.log(`\nIMPORTANT: your CORS setup lists allowedHeaders in:\n  ${hits.join('\n  ')}\nAdd 'Idempotency-Key' to that list, and 'Idempotent-Replay', 'Retry-After' to exposedHeaders if you have one.`);
else console.log('\nCORS: no fixed allowedHeaders list found, so the Idempotency-Key header is allowed automatically.');
