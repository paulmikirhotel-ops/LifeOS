import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const server = fileURLToPath(new URL('..', import.meta.url));

test('patch mounts the extras before the main Community router, keeps Windows line endings, and is safe to run twice', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cx-patch-'));
  fs.mkdirSync(path.join(tmp, 'src/routes'), { recursive: true });
  const original = ["import goalRoutes from './goal.routes.js';", "import communityRoutes from './community.routes.js';", "router.use('/goals', goalRoutes);", "  router.use('/community', communityRoutes);", ''].join('\r\n');
  fs.writeFileSync(path.join(tmp, 'src/routes/index.js'), original);
  const run = () => execFileSync('node', [path.join(server, 'scripts/apply-community-extras-patch.mjs')], { cwd: tmp, encoding: 'utf8' });
  const first = run();
  const idx = fs.readFileSync(path.join(tmp, 'src/routes/index.js'), 'utf8');
  assert.match(first, /patched src\/routes\/index\.js/);
  assert.match(idx, /import communityExtrasRoutes from '\.\/communityExtras\.routes\.js';/);
  assert.ok(idx.indexOf("router.use('/community', communityExtrasRoutes);") < idx.indexOf("router.use('/community', communityRoutes);"), 'extras come first');
  assert.match(idx, /^ {2}router\.use\('\/community', communityExtrasRoutes\);/m, 'keeps the indentation');
  assert.ok(idx.includes('\r\n') && !/[^\r]\n/.test(idx), 'keeps Windows line endings');
  assert.match(run(), /src\/routes\/index\.js: nothing to do/);
  assert.equal((fs.readFileSync(path.join(tmp, 'src/routes/index.js'), 'utf8').match(/communityExtrasRoutes\)/g) || []).length, 1);
});

test('without the Community phase the patch says so instead of guessing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cx-patch2-'));
  fs.mkdirSync(path.join(tmp, 'src/routes'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'src/routes/index.js'), "import goalRoutes from './goal.routes.js';\nrouter.use('/goals', goalRoutes);\n");
  const out = execFileSync('node', [path.join(server, 'scripts/apply-community-extras-patch.mjs')], { cwd: tmp, encoding: 'utf8' });
  assert.match(out, /WARNING: could not find the community\.routes import/);
  assert.match(out, /WARNING: could not find router\.use\('\/community', communityRoutes\)/);
});
