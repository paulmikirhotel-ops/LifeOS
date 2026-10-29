import crypto from 'node:crypto';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/index.js';
import { QrLogin } from '../models/deviceLink.model.js';
import { generateToken, hashToken } from '../utils/token.js';
import { startSession } from './auth.service.js';
import { QR_TTL_MS, newPairCode, normalizePair, describeDevice, maskIp, qrState, secondsLeft } from '../utils/deviceLink.logic.js';

/**
 * Sign in with QR.
 *  1. A computer asks for a code (start) and keeps a SECRET that is never put in the QR.
 *  2. A phone that is already signed in looks at the code (peek / lookup), sees which device is asking, and taps Allow (approve).
 *  3. The computer asks "was it approved?" (status) with its secret and, once, receives its own sign-in.
 * Only hashes of the code and the secret are stored.
 */

const expired = () => new ApiError(410, 'This code has expired or was already used. Ask for a new one on the computer.', { code: 'LINK_EXPIRED' });
const sameHash = (a, b) => {
  const x = Buffer.from(String(a), 'hex');
  const y = Buffer.from(String(b), 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

/** Only a signed-in person whose email is verified may allow a computer in. */
async function assertMayApprove(me) {
  const user = await User.findById(me.id).select('isEmailVerified status');
  if (!user || user.status !== 'active') throw ApiError.unauthorized('Account not available');
  if (!user.isEmailVerified) {
    throw new ApiError(403, 'Verify your email first. Then you can sign in other devices with a QR code.', { code: 'EMAIL_NOT_VERIFIED' });
  }
}

/** Computer: ask for a new code. */
export async function start(ctx = {}, now = new Date()) {
  const code = generateToken(24);
  const secret = generateToken(24);
  const dev = describeDevice(ctx.userAgent);
  const row = await QrLogin.create({
    codeHash: hashToken(code),
    secretHash: hashToken(secret),
    pairCode: newPairCode(),
    status: 'pending',
    device: { label: dev.label, kind: dev.kind, ip: maskIp(ctx.ip) },
    expiresAt: new Date(now.getTime() + QR_TTL_MS),
  });
  return { code, secret, pairCode: row.pairCode, expiresAt: row.expiresAt, ttlMs: QR_TTL_MS };
}

/**
 * Computer: has the phone said yes? Returns { status } or, once, { status: 'approved', session }.
 * A wrong code or a wrong secret gets the same answer as an old code, so nothing can be probed.
 */
export async function status(code, secret, ctx = {}, now = new Date()) {
  const row = await QrLogin.findOne({ codeHash: hashToken(code) });
  if (!row || !sameHash(row.secretHash, hashToken(secret))) return { status: 'expired' };
  const state = qrState(row, now);
  if (state !== 'approved') return { status: state, secondsLeft: state === 'pending' ? secondsLeft(row.expiresAt, now) : 0 };

  // Collect the sign-in exactly once, even if two polls arrive together.
  const claimed = await QrLogin.findOneAndUpdate({ _id: row._id, status: 'approved' }, { $set: { status: 'used', usedAt: now } }, { new: true });
  if (!claimed) return { status: 'used' };
  const user = await User.findById(row.userId);
  if (!user || user.status !== 'active') return { status: 'denied' };
  const session = await startSession(user, { userAgent: ctx.userAgent, ip: ctx.ip, via: 'qr' });
  return { status: 'approved', session };
}

function filterFor(target, now) {
  const base = { status: 'pending', expiresAt: { $gt: now } };
  return target.code ? { ...base, codeHash: hashToken(target.code) } : { ...base, _id: target.ref };
}

function shown(row, now) {
  return { pairCode: row.pairCode, device: { label: row.device?.label || 'Unknown device', kind: row.device?.kind || 'web', ip: row.device?.ip || '' }, secondsLeft: secondsLeft(row.expiresAt, now) };
}

/** Phone: what is this code? (shown before the person decides) */
export async function peek(me, code, now = new Date()) {
  await assertMayApprove(me);
  const row = await QrLogin.findOne({ codeHash: hashToken(code), status: 'pending', expiresAt: { $gt: now } });
  if (!row) throw expired();
  return shown(row, now);
}

/** Phone: the person typed the short pair code instead of scanning. Returns a reference to approve with. */
export async function lookup(me, pair, now = new Date()) {
  await assertMayApprove(me);
  const normal = normalizePair(pair);
  if (!normal) throw ApiError.badRequest('That does not look like a pair code. It has 8 letters and numbers, like K7M2-9QXF.');
  const row = await QrLogin.findOne({ pairCode: normal, status: 'pending', expiresAt: { $gt: now } });
  if (!row) throw expired();
  return { ref: String(row._id), ...shown(row, now) };
}

/** Phone: tap Allow. */
export async function approve(me, target, ctx = {}, now = new Date()) {
  await assertMayApprove(me);
  const row = await QrLogin.findOneAndUpdate(
    filterFor(target, now),
    { $set: { status: 'approved', userId: me.id, approvedAt: now } },
    { new: true }
  );
  if (!row) throw expired();
  return { approved: true, device: { label: row.device?.label || 'Unknown device' } };
}

/** Phone: tap Deny. */
export async function deny(me, target, now = new Date()) {
  await assertMayApprove(me);
  const row = await QrLogin.findOneAndUpdate(filterFor(target, now), { $set: { status: 'denied' } }, { new: true });
  if (!row) throw expired();
  return { denied: true };
}
