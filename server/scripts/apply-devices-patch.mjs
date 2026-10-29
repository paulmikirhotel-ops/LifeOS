#!/usr/bin/env node
/**
 * Run from the server folder (safe to run again):   node scripts/apply-devices-patch.mjs
 *
 * 1. src/services/auth.service.js     - each signed-in DEVICE gets its own session (before, a second sign-in
 *                                       signed the first device out). Password change / reset / delete still sign everyone out.
 * 2. src/controllers/auth.controller.js - passes the device (browser name, shortened address) to login / register / logout.
 * 3. src/routes/index.js              - mounts /api/auth/link (Sign in with QR + the list of devices) BEFORE /api/auth.
 * Each step prints "patched", "nothing to do" or "WARNING". Nothing is written for a file if one of its steps fails.
 */
import fs from 'node:fs';
import path from 'node:path';

let failed = false;

function edit(rel, steps) {
  const file = path.resolve(rel);
  if (!fs.existsSync(file)) {
    console.warn(`WARNING: ${rel} not found. Run this inside the server folder.`);
    failed = true;
    return;
  }
  let src = fs.readFileSync(file, 'utf8');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  let changed = false;
  let bad = false;
  for (const { name, done, re, to, all, optional } of steps) {
    if (done(src)) {
      console.log(`${rel} - ${name}: nothing to do`);
      continue;
    }
    if (!re.test(src)) {
      if (optional) continue; // another step below covers this file differently
      console.warn(`WARNING: ${rel} - ${name}: could not find the place to change.`);
      bad = true;
      continue;
    }
    src = src.replace(all ? new RegExp(re.source, 'g') : re, (...m) => to(m, eol));
    console.log(`${rel} - ${name}: patched`);
    changed = true;
  }
  if (bad) {
    failed = true;
    console.warn(`WARNING: ${rel} was NOT written.`);
  } else if (changed) {
    fs.writeFileSync(file, src);
  }
}

const L = (text, eol) => text.replace(/\n/g, eol);

edit('src/services/auth.service.js', [
  {
    name: 'import sessions',
    done: (s) => s.includes("from './session.service.js'"),
    re: /(import \{ removeAllForUser as removePush \} from '\.\/push\.service\.js';)/,
    to: (m, eol) => `${m[1]}${eol}import { openSession, rotateSession, closeSession, revokeAllSessions } from './session.service.js';`,
  },
  {
    name: 'startSession',
    done: (s) => s.includes('await openSession(user, ctx)'),
    re: /export async function startSession\(user\) \{[\s\S]*?\r?\n\}\r?\n/,
    to: (m, eol) =>
      L(`export async function startSession(user, ctx = {}) {
  const { accessToken, refreshToken } = await openSession(user, ctx);
  return {
    user: publicUser(user),
    memberships: await buildMembershipList(user._id),
    accessToken,
    refreshToken,
  };
}
`, eol),
  },
  {
    name: 'login device',
    done: (s) => s.includes('export async function login({ email, password }, ctx = {})'),
    re: /export async function login\(\{ email, password \}\) \{/,
    to: () => 'export async function login({ email, password }, ctx = {}) {',
  },
  {
    name: 'login session',
    done: (s) => s.includes('return startSession(user, ctx);'),
    re: /(await user\.save\(\);\r?\n[ \t]*)return startSession\(user\);/,
    to: (m) => `${m[1]}return startSession(user, ctx);`,
  },
  {
    name: 'refreshSession',
    done: (s) => s.includes('await rotateSession(refreshToken)'),
    re: /export async function refreshSession\(refreshToken\) \{[\s\S]*?\r?\n\}\r?\n/,
    to: (m, eol) =>
      L(`export async function refreshSession(refreshToken) {
  // Only THIS device's token is replaced; other devices stay signed in.
  const { user, accessToken, refreshToken: next } = await rotateSession(refreshToken);
  return { user: publicUser(user), memberships: await buildMembershipList(user._id), accessToken, refreshToken: next };
}
`, eol),
  },
  {
    name: 'logout',
    done: (s) => s.includes('await closeSession(userId, refreshToken)'),
    re: /export async function logout\(userId\) \{[\s\S]*?\r?\n\}\r?\n/,
    to: (m, eol) =>
      L(`export async function logout(userId, refreshToken) {
  // Signs out this device only. Push alerts are switched off only when no device is left.
  const left = await closeSession(userId, refreshToken);
  if (left === 0) await removePush(userId);
  await User.updateOne({ _id: userId }, { $unset: { refreshTokenHash: 1, refreshTokenExpiresAt: 1 } });
}
`, eol),
  },
  {
    name: 'password change / reset sign everyone out',
    done: (s) => s.includes('await revokeAllSessions(user._id);'),
    re: /(user\.refreshTokenHash = undefined;\r?\n([ \t]*)await user\.save\(\);)/,
    all: true,
    to: (m, eol) => `${m[1]}${eol}${m[2]}await revokeAllSessions(user._id);`,
  },
  {
    name: 'delete account signs everyone out',
    done: (s) => s.includes('await revokeAllSessions(userId);'),
    re: /(await Membership\.updateMany\(\{ userId \}, \{ status: 'left' \}\);)/,
    to: (m, eol) => `${m[1]}${eol}  await revokeAllSessions(userId);`,
  },
]);

edit('src/controllers/auth.controller.js', [
  {
    name: 'import device helper',
    done: (s) => s.includes("from '../services/session.service.js'"),
    re: /(import \{ setAuthCookies, clearAuthCookies, REFRESH_COOKIE \} from '\.\.\/utils\/token\.js';)/,
    to: (m, eol) => `${m[1]}${eol}import { deviceFrom } from '../services/session.service.js';`,
  },
  {
    name: 'register device',
    done: (s) => s.includes("via: 'register'"),
    re: /authService\.startSession\(user\)/,
    to: () => "authService.startSession(user, { ...deviceFrom(req), via: 'register' })",
  },
  {
    name: 'login device',
    done: (s) => s.includes('authService.login(req.body, deviceFrom(req))'),
    re: /authService\.login\(req\.body\)/,
    to: () => 'authService.login(req.body, deviceFrom(req))',
  },
  {
    name: 'logout this device',
    done: (s) => s.includes('authService.logout(req.user.id, req.cookies?.[REFRESH_COOKIE])'),
    re: /authService\.logout\(req\.user\.id\)/,
    to: () => 'authService.logout(req.user.id, req.cookies?.[REFRESH_COOKIE])',
  },
]);

edit('src/routes/index.js', [
  {
    name: 'import',
    done: (s) => s.includes('deviceLink.routes.js'),
    re: /(import \{ Router \} from 'express';)/,
    to: (m, eol) => `${m[1]}${eol}import deviceLinkRoutes from './deviceLink.routes.js';`,
  },
  {
    name: 'mount before /auth',
    optional: true,
    done: (s) => s.includes("'/auth/link'"),
    re: /^([ \t]*)(router\.use\('\/auth',\s*authRoutes\);)/m,
    to: (m, eol) => `${m[1]}// Sign in with QR + linked devices. Before /auth, so the 2-second checks do not use up the password limit.${eol}${m[1]}router.use('/auth/link', deviceLinkRoutes);${eol}${m[1]}${m[2]}`,
  },
  {
    name: 'mount (at the top, before every other route)',
    done: (s) => s.includes("'/auth/link'"),
    re: /^([ \t]*)(router\.use\(idempotency\);)/m,
    to: (m, eol) => `${m[1]}${m[2]}${eol}${m[1]}// Sign in with QR + linked devices (before /auth, so the 2-second checks do not use up the password limit).${eol}${m[1]}router.use('/auth/link', deviceLinkRoutes);`,
  },
]);

process.exit(failed ? 1 : 0);
