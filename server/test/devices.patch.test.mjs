import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const serverDir = fileURLToPath(new URL('..', import.meta.url));
const script = path.join(serverDir, 'scripts', 'apply-devices-patch.mjs');
const made = [];
after(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const SERVICE = `import { User, Membership } from '../models/index.js';
import { removeAllForUser as removePush } from './push.service.js';

export async function startSession(user) {
  const accessToken = sign(user);
  const refreshToken = signR(user);
  user.refreshTokenHash = hash(refreshToken);
  await user.save();
  return { user: publicUser(user), memberships: await buildMembershipList(user._id), accessToken, refreshToken };
}

export async function login({ email, password }) {
  const user = await User.findOne({ email });
  user.lastLoginAt = new Date();
  await user.save();
  return startSession(user);
}

export async function refreshSession(refreshToken) {
  const user = await User.findOne({ refreshTokenHash: hash(refreshToken) });
  return startSession(user);
}

export async function logout(userId) {
  await User.updateOne({ _id: userId }, { $unset: { refreshTokenHash: 1 } });
  await removePush(userId);
}

export async function changePassword(userId, body) {
  const user = await User.findById(userId);
  user.passwordHash = await h(body.new);
  user.refreshTokenHash = undefined;
  await user.save();
}

export async function resetPassword(body) {
  const user = await User.findOne({ x: 1 });
  user.refreshTokenHash = undefined;
  await user.save();
}

export async function deleteAccount(userId) {
  await Membership.updateMany({ userId }, { status: 'left' });
  await User.deleteOne({ _id: userId });
}
`;
const CONTROLLER = `import * as authService from '../services/auth.service.js';
import { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } from '../utils/token.js';

export async function register(req, res) {
  const user = await make(req.body);
  const session = await authService.startSession(user);
  setAuthCookies(res, session.accessToken, session.refreshToken);
}
export async function login(req, res) {
  const session = await authService.login(req.body);
  setAuthCookies(res, session.accessToken, session.refreshToken);
}
export async function logout(req, res) {
  await authService.logout(req.user.id);
  clearAuthCookies(res);
}
`;
const INDEX = `import { Router } from 'express';
import authRoutes from './auth.routes.js';
const router = Router();
router.use(idempotency);
router.use('/auth', authRoutes);
export default router;
`;

function setup(eol) {
  const dir = fs.mkdtempSync(path.join(serverDir, '.tmp-devpatch-'));
  made.push(dir);
  const w = (rel, text) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text.replace(/\n/g, eol)); };
  w('src/services/auth.service.js', SERVICE); w('src/controllers/auth.controller.js', CONTROLLER); w('src/routes/index.js', INDEX);
  return dir;
}
const run = (dir) => spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');

for (const [name, eol] of [['LF', '\n'], ['CRLF', '\r\n']]) {
  test(`server patch works on ${name} files and a second run changes nothing`, () => {
    const dir = setup(eol);
    const r1 = run(dir);
    assert.equal(r1.status, 0, r1.stderr + r1.stdout);
    const svc = read(dir, 'src/services/auth.service.js');
    assert.match(svc, /import \{ openSession, rotateSession, closeSession, revokeAllSessions \} from '\.\/session\.service\.js';/);
    assert.match(svc, /await openSession\(user, ctx\)/);
    assert.match(svc, /export async function login\(\{ email, password \}, ctx = \{\}\)/);
    assert.match(svc, /return startSession\(user, ctx\);/);
    assert.match(svc, /await rotateSession\(refreshToken\)/);
    assert.match(svc, /await closeSession\(userId, refreshToken\)/);
    assert.equal((svc.match(/await revokeAllSessions\(user\._id\);/g) || []).length, 2, 'password change and reset');
    assert.match(svc, /await revokeAllSessions\(userId\);/);
    assert.ok(!svc.includes('user.refreshTokenHash = hash'), 'the old single-token code is gone');
    const ctl = read(dir, 'src/controllers/auth.controller.js');
    assert.match(ctl, /import \{ deviceFrom \} from '\.\.\/services\/session\.service\.js';/);
    assert.match(ctl, /startSession\(user, \{ \.\.\.deviceFrom\(req\), via: 'register' \}\)/);
    assert.match(ctl, /authService\.login\(req\.body, deviceFrom\(req\)\)/);
    assert.match(ctl, /authService\.logout\(req\.user\.id, req\.cookies\?\.\[REFRESH_COOKIE\]\)/);
    const idx = read(dir, 'src/routes/index.js');
    assert.match(idx, /import deviceLinkRoutes from '\.\/deviceLink\.routes\.js';/);
    assert.ok(idx.indexOf("'/auth/link'") !== -1 && idx.indexOf("'/auth/link'") < idx.indexOf("router.use('/auth', authRoutes)"), '/auth/link is mounted before /auth');
    for (const f of [svc, ctl, idx]) {
      if (eol === '\r\n') assert.ok(!/[^\r]\n/.test(f), 'mixed line endings'); else assert.ok(!f.includes('\r'));
    }
    const r2 = run(dir);
    assert.equal(r2.status, 0);
    assert.ok(!/patched/.test(r2.stdout));
    assert.deepEqual([read(dir, 'src/services/auth.service.js'), read(dir, 'src/controllers/auth.controller.js'), read(dir, 'src/routes/index.js')], [svc, ctl, idx]);
  });
}

test('a file that does not match is left untouched and the script exits with an error', () => {
  const dir = setup('\n');
  fs.writeFileSync(path.join(dir, 'src/controllers/auth.controller.js'), 'export const x = 1;\n');
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /auth\.controller\.js was NOT written/);
  assert.equal(read(dir, 'src/controllers/auth.controller.js'), 'export const x = 1;\n');
});
