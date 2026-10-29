import bcrypt from 'bcryptjs';
import { ApiError } from '../utils/ApiError.js';
import { User, Tenant, Membership, Invitation } from '../models/index.js';
import { ROLE_PERMISSIONS } from '../config/permissions.js';
import { generateToken, hashToken, signAccessToken, signRefreshToken } from '../utils/token.js';
import { sendMail } from '../utils/mailer.js';
import { env } from '../config/env.js';
import { removeAllForUser as removePush } from './push.service.js';
import { openSession, rotateSession, closeSession, revokeAllSessions } from './session.service.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    isEmailVerified: user.isEmailVerified,
    activeTenantId: user.activeTenantId ? user.activeTenantId.toString() : null,
  };
}

async function buildMembershipList(userId) {
  const memberships = await Membership.find({ userId, status: 'active' })
    .populate('tenantId', 'name type status')
    .sort({ createdAt: 1 })
    .lean();
  return memberships.map((m) => ({
    tenantId: m.tenantId._id.toString(),
    name: m.tenantId.name,
    type: m.tenantId.type,
    role: m.role,
    permissions: m.permissions,
  }));
}

async function pendingInvites(email) {
  const invites = await Invitation.find({ email, status: 'pending', expiresAt: { $gt: new Date() } })
    .populate('tenantId', 'name type')
    .lean();
  return invites.map((i) => ({
    invitationId: i._id.toString(),
    tenantId: i.tenantId._id.toString(),
    tenantName: i.tenantId.name,
    role: i.role,
    expiresAt: i.expiresAt,
  }));
}

/** Creates the user + (optionally) their first workspace. Used by register & invite-accept. */
export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

/** Milliseconds the user still has to wait before another verification email may be sent (0 = go ahead). */
export function resendWaitMs(verificationExpiresAt, now = Date.now()) {
  if (!verificationExpiresAt) return 0;
  const sentAt = new Date(verificationExpiresAt).getTime() - VERIFICATION_TTL_MS;
  return Math.max(0, RESEND_COOLDOWN_MS - (now - sentAt));
}

/** Creates a fresh 24-hour verification link and emails it (dev: logged by the mailer). */
async function sendVerificationEmail(user) {
  const token = generateToken();
  user.verificationTokenHash = hashToken(token);
  user.verificationExpiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
  await user.save();
  await sendMail({
    to: user.email,
    subject: 'Verify your LifeOS email',
    text: `Verify your email: ${env.clientUrls[0]}/verify-email?token=${token}`,
  });
}

/**
 * Sends a new verification link to a signed-in, unverified user.
 * Limited to one email per minute so it cannot be used to spam an inbox.
 */
export async function resendVerification(userId) {
  const user = await User.findById(userId).select('+verificationTokenHash');
  if (!user || user.status !== 'active') throw ApiError.unauthorized('Account not available');
  if (user.isEmailVerified) return { alreadyVerified: true };

  const wait = resendWaitMs(user.verificationExpiresAt);
  if (wait > 0) {
    throw new ApiError(429, `Please wait ${Math.ceil(wait / 1000)} seconds before asking for another email`, {
      code: 'RATE_LIMITED',
    });
  }

  await sendVerificationEmail(user);
  return { sent: true };
}

async function createUserWithWorkspace({ name, email, password, tenantType, organizationName }) {
  if (!EMAIL_RE.test(email)) throw ApiError.badRequest('A valid email is required');
  const exists = await User.findOne({ email }).select('+passwordHash');
  if (exists && exists.status !== 'deleted') {
    throw ApiError.conflict('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email, passwordHash });

  // Workspace creation is optional (invite-accept flow joins an existing tenant instead).
  let tenant = null;
  let membership = null;
  if (tenantType) {
    tenant = await Tenant.create({
      name: tenantType === 'personal' ? `${name}'s Workspace` : organizationName,
      type: tenantType,
      ownerUserId: user._id,
    });
    membership = await Membership.create({
      tenantId: tenant._id,
      userId: user._id,
      role: 'owner',
      permissions: ROLE_PERMISSIONS.owner,
      joinedAt: new Date(),
    });
    user.activeTenantId = tenant._id;
  }
  await user.save();

  await sendVerificationEmail(user);

  return { user, tenant, membership };
}

export async function register({ name, email, password, tenantType, organizationName }) {
  if (tenantType === 'organization' && !organizationName?.trim()) {
    throw ApiError.badRequest('Organization name is required');
  }
  return createUserWithWorkspace({ name, email, password, tenantType, organizationName });
}

/** Mints a fresh token pair for an existing user (login + register). */
export async function startSession(user, ctx = {}) {
  const { accessToken, refreshToken } = await openSession(user, ctx);
  return {
    user: publicUser(user),
    memberships: await buildMembershipList(user._id),
    accessToken,
    refreshToken,
  };
}

export async function login({ email, password }, ctx = {}) {
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || user.status === 'deleted') throw ApiError.unauthorized('Invalid email or password');
  if (user.status === 'suspended') throw ApiError.forbidden('Account suspended');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw ApiError.unauthorized('Invalid email or password');

  user.lastLoginAt = new Date();
  await user.save();
  return startSession(user, ctx);
}

export async function refreshSession(refreshToken) {
  // Only THIS device's token is replaced; other devices stay signed in.
  const { user, accessToken, refreshToken: next } = await rotateSession(refreshToken);
  return { user: publicUser(user), memberships: await buildMembershipList(user._id), accessToken, refreshToken: next };
}

export async function logout(userId, refreshToken) {
  // Signs out this device only. Push alerts are switched off only when no device is left.
  const left = await closeSession(userId, refreshToken);
  if (left === 0) await removePush(userId);
  await User.updateOne({ _id: userId }, { $unset: { refreshTokenHash: 1, refreshTokenExpiresAt: 1 } });
}

export async function me(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  return {
    user: publicUser(user),
    memberships: await buildMembershipList(userId),
    pendingInvitations: await pendingInvites(user.email),
  };
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw ApiError.badRequest('Current password is incorrect');
  if (newPassword.length < 8) throw ApiError.badRequest('New password must be at least 8 characters');
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.refreshTokenHash = undefined;
  await user.save();
  await revokeAllSessions(user._id);
}

export async function forgotPassword(email) {
  const user = await User.findOne({ email });
  if (!user || user.status !== 'active') return { devLogged: true }; // no account enumeration
  const token = generateToken();
  user.passwordResetTokenHash = hashToken(token);
  user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();
  return sendMail({
    to: user.email,
    subject: 'Reset your LifeOS password',
    text: `Reset your password: ${env.clientUrls[0]}/reset-password?token=${token}`,
  });
}

export async function resetPassword(token, newPassword) {
  if (!token) throw ApiError.badRequest('Reset token is required');
  const user = await User.findOne({ passwordResetTokenHash: hashToken(token) });
  if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
    throw ApiError.badRequest('Reset token is invalid or expired');
  }
  if (newPassword.length < 8) throw ApiError.badRequest('Password must be at least 8 characters');
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  user.refreshTokenHash = undefined;
  await user.save();
  await revokeAllSessions(user._id);
}

export async function verifyEmail(token) {
  const user = await User.findOne({ verificationTokenHash: hashToken(token) });
  if (!user || !user.verificationExpiresAt || user.verificationExpiresAt < new Date()) {
    throw ApiError.badRequest('Verification token is invalid or expired');
  }
  user.isEmailVerified = true;
  user.verificationTokenHash = undefined;
  user.verificationExpiresAt = undefined;
  await user.save();
}

/**
 * Soft-deletes the account. Organization tenants the user owns with other active
 * members must be transferred first (409 lists them) — data is never orphaned silently.
 */
export async function deleteAccount(userId) {
  const ownedOrgs = await Tenant.find({ ownerUserId: userId, type: 'organization', status: 'active' }).lean();
  const blocked = [];
  for (const t of ownedOrgs) {
    const others = await Membership.countDocuments({ tenantId: t._id, status: 'active', userId: { $ne: userId } });
    if (others > 0) blocked.push(t.name);
  }
  if (blocked.length > 0) {
    throw new ApiError(409, 'Transfer ownership of these workspaces before deleting your account', {
      code: 'CONFLICT',
      errors: blocked.map((name) => ({ field: 'organization', message: name })),
    });
  }

  await User.updateOne(
    { _id: userId },
    {
      status: 'deleted',
      deletedAt: new Date(),
      email: `deleted-${userId}@lifeos.invalid`,
      name: 'Deleted user',
      $unset: { refreshTokenHash: 1, activeTenantId: 1, verificationTokenHash: 1, passwordResetTokenHash: 1 },
    }
  );
  await Membership.updateMany({ userId }, { status: 'left' });
  await revokeAllSessions(userId);
  await Tenant.updateMany({ ownerUserId: userId, type: 'personal' }, { status: 'suspended' });
}
