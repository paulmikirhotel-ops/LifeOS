import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const serverDir = fileURLToPath(new URL('..', import.meta.url));
const script = path.join(serverDir, 'scripts', 'apply-push-patch.mjs');
const made = [];
after(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const FILE = `import { ApiError } from '../utils/ApiError.js';
import { pushToUser } from './push.service.js';

export async function start() {
  const callerName = 'x';
  tell(conv, { kind: 'call' }, me);
  membersOf(conv).filter((m) => m !== String(me)).forEach((m) => pushToUser(m, { title: \`\${callerName} is calling\`, body: call.mode === 'video' ? 'Incoming video call' : 'Incoming voice call', url: '/connect', tag: \`call-\${call._id}\`, urgent: true }));
  setTimeout(() => {}, 1);
}
`;
function setup(eol, text = FILE) {
  const dir = fs.mkdtempSync(path.join(serverDir, '.tmp-pushpatch-')); made.push(dir);
  const f = path.join(dir, 'src/services/connectCall.service.js'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text.replace(/\n/g, eol));
  return { dir, f };
}
const run = (dir) => spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
for (const [name, eol] of [['LF', '\n'], ['CRLF', '\r\n']]) {
  test(`push patch (${name}): adds the app ring once, keeps the web push, safe to run twice`, () => {
    const { dir, f } = setup(eol);
    assert.equal(run(dir).status, 0);
    const out = fs.readFileSync(f, 'utf8');
    assert.match(out, /import \{ sendCallPush \} from '\.\/fcm\.service\.js';/);
    assert.equal((out.match(/sendCallPush\(m,/g) || []).length, 1);
    assert.match(out, /pushToUser\(m, \{ title:/, 'the web push is still there');
    assert.match(out, /callId: String\(call\._id\)/);
    if (eol === '\r\n') assert.ok(!/[^\r]\n/.test(out)); else assert.ok(!out.includes('\r'));
    assert.match(run(dir).stdout, /nothing to do/);
    assert.equal(fs.readFileSync(f, 'utf8'), out);
  });
}
test('an unexpected file is left alone with a warning', () => {
  const { dir, f } = setup('\n', 'export const x = 1;\n');
  const r = run(dir); assert.equal(r.status, 1); assert.match(r.stderr, /could not find/);
  assert.equal(fs.readFileSync(f, 'utf8'), 'export const x = 1;\n');
});
