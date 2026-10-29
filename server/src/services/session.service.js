import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/index.js';
import { UserSession } from '../models/deviceLink.model.js';
import { generateToken, hashToken, signAccessToken, signRefreshToken } from '../utils/token.js';
import { SESSION_TTL_MS, MAX_SESSIONS, describeDevice, maskIp } from '../utils/deviceLink.logic.js';

/**
 * One signed-in DEVICE = one row in UserSession.
 * Before, the user had a single refresh token, so signing in on a second device signed the first one out.
 */

/** What we remember about the device a request came from. */
export function deviceFrom(req) {
  return { userAgent: String(req.headers?.['user-agent'] || '').slice(0, 300), ip: req.ip };
}

async function pruneSessions(userId) {
  const extra = await UserSession.find({ userId }).sort({ lastUsedAt: -1 }).skip(MAX_SESSIONS).select('_id').lean();
  if (extra.length) await UserSession.deleteMany({ _id: { $in: extra.map((e) => e._id) } });
}

/** Signs a device in: a new refresh token (stored only as a hash) and a new access token. */
export async function openSession(user, ctx = {}, now = new Date()) {
  const id = user._id.toString();
  // jti makes two tokens made in the same second different, so each device has its own.
  const refreshToken = signRefreshToken({ sub: id, type: 'refresh', jti: generateToken(8) });
  const dev = describeDevice(ctx.userAgent);
  await UserSession.create({
    userId: user._id,
    refreshHash: hashToken(refreshToken),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    lastUsedAt: now,
    device: { label: dev.label, kind: dev.kind, ip: maskIp(ctx.ip) },
    via: ctx.via || 'password',
  });
  await pruneSessions(user._id);
  return { accessToken: signAccessToken({ sub: id, type: 'access' }), refreshToken };
}

/** A person who was signed in before this update still has the old single token on their user. Turn it into a session once. */
async function adoptLegacy(oldHash, now) {
  const legacy = await User.findOne({ refreshTokenHash: oldHash }).select('+refreshTokenHash');
  if (!legacy || legacy.status !== 'active' || !legacy.refreshTokenExpiresAt || new Date(legacy.refreshTokenExpiresAt) <= now) return null;
  let session = null;
  try {
    session = await UserSession.create({
      userId: legacy._id,
      refreshHash: oldHash,
      expiresAt: legacy.refreshTokenExpiresAt,
      lastUsedAt: now,
      device: { label: 'Earlier sign-in', kind: 'web', ip: '' },
      via: 'password',
    });
  } catch {
    session = await UserSession.findOne({ refreshHash: oldHash }); // two refreshes at once: the other one made it
  }
  await User.updateOne({ _id: legacy._id }, { $unset: { refreshTokenHash: 1, refreshTokenExpiresAt: 1 } });
  return session;
}

/** Swaps a refresh token for a new pair. The old token stops working (rotation), only for THIS device. */
export async function rotateSession(refreshToken, now = new Date()) {
  if (!refreshToken) throw ApiError.unauthorized('No refresh token');
  const oldHash = hashToken(refreshToken);
  let session = await UserSession.findOne({ refreshHash: oldHash });
  if (!session) session = await adoptLegacy(oldHash, now);
  if (!session) throw ApiError.unauthorized('Session invalid');
  if (new Date(session.expiresAt) <= now) {
    await UserSession.deleteOne({ _id: session._id });
    throw ApiError.unauthorized('Session expired');
  }
  const user = await User.findById(session.userId);
  if (!user || user.status !== 'active') throw ApiError.unauthorized('Session invalid');

  const nextToken = signRefreshToken({ sub: user._id.toString(), type: 'refresh', jti: generateToken(8) });
  // Only one of two refreshes that arrive together can win; the other is told the token is no longer valid.
  const swapped = await UserSession.findOneAndUpdate(
    { _id: session._id, refreshHash: oldHash },
    { $set: { refreshHash: hashToken(nextToken), expiresAt: new Date(now.getTime() + SESSION_TTL_MS), lastUsedAt: now } },
    { new: true }
  );
  if (!swapped) throw ApiError.unauthorized('Session invalid');
  return { user, accessToken: signAccessToken({ sub: user._id.toString(), type: 'access' }), refreshToken: nextToken };
}

/** Signs one device out (the one holding this token). Without a token it signs out every device, as before. Returns how many devices are still signed in. */
export async function closeSession(userId, refreshToken) {
  if (refreshToken) await UserSession.deleteMany({ userId, refreshHash: hashToken(refreshToken) });
  else await UserSession.deleteMany({ userId });
  return UserSession.countDocuments({ userId });
}

/** Password changed or reset, account deleted: every device is signed out. */
export async function revokeAllSessions(userId) {
  await UserSession.deleteMany({ userId });
}

/** The devices signed in as me, newest use first. `current` marks the one asking. */
export async function listDevices(userId, currentRefreshToken) {
  const currentHash = currentRefreshToken ? hashToken(currentRefreshToken) : null;
  const rows = await UserSession.find({ userId }).sort({ lastUsedAt: -1 }).lean();
  return {
    items: rows.map((s) => ({
      id: String(s._id),
      label: s.device?.label || 'Unknown device',
      kind: s.device?.kind || 'web',
      ip: s.device?.ip || '',
      via: s.via || 'password',
      lastUsedAt: s.lastUsedAt,
      signedInAt: s.createdAt,
      current: Boolean(currentHash) && s.refreshHash === currentHash,
    })),
  };
}

/** Signs out one device from the list. Only my own devices can be removed. */
export async function removeDevice(userId, id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Device not found');
  const r = await UserSession.deleteOne({ _id: id, userId });
  if (!r.deletedCount) throw ApiError.notFound('Device not found');
  return { removed: true };
}
