import bcrypt from 'bcryptjs';
import { ApiError } from '../utils/ApiError.js';
import { User, Tenant, Membership, Invitation } from '../models/index.js';
import { ROLE_PERMISSIONS } from '../config/permissions.js';
import { generateToken, hashToken, signAccessToken, signRefreshToken } from '../utils/token.js';
import { sendMail } from '../utils/mailer.js';
import { env } from '../config/env.js';

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
export async function createUserWithWorkspace({ name, email, password, tenantType, organizationName }) {
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

  // Email verification token (dev: logged by mailer).
  const token = generateToken();
  user.verificationTokenHash = hashToken(token);
  user.verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();
  await sendMail({
    to: user.email,
    subject: 'Verify your LifeOS email',
    text: `Verify your email: ${env.clientUrls[0]}/verify-email?token=${token}`,
  });

  return { user, tenant, membership };
}

export async function register({ name, email, password, tenantType, organizationName }) {
  if (tenantType === 'organization' && !organizationName?.trim()) {
    throw ApiError.badRequest('Organization name is required');
  }
  return createUserWithWorkspace({ name, email, password, tenantType, organizationName });
}

/** Mints a fresh token pair for an existing user (login + register). */
export async function startSession(user) {
  const refreshToken = signRefreshToken({ sub: user._id.toString(), type: 'refresh' });
  user.refreshTokenHash = hashToken(refreshToken);
  user.refreshTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await user.save();
  const accessToken = signAccessToken({ sub: user._id.toString(), type: 'access' });
  return {
    user: publicUser(user),
    memberships: await buildMembershipList(user._id),
    accessToken,
    refreshToken,
  };
}

export async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || user.status === 'deleted') throw ApiError.unauthorized('Invalid email or password');
  if (user.status === 'suspended') throw ApiError.forbidden('Account suspended');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw ApiError.unauthorized('Invalid email or password');

  user.lastLoginAt = new Date();
  await user.save();
  return startSession(user);
}

export async function refreshSession(refreshToken) {
  if (!refreshToken) throw ApiError.unauthorized('No refresh token');
  const user = await User.findOne({ refreshTokenHash: hashToken(refreshToken) }).select('+refreshTokenHash');
  if (!user || user.status !== 'active') throw ApiError.unauthorized('Session invalid');
  if (!user.refreshTokenExpiresAt || user.refreshTokenExpiresAt < new Date()) {
    throw ApiError.unauthorized('Session expired');
  }

  // Rotation: issue a new refresh token and replace the stored hash.
  const newRefresh = signRefreshToken({ sub: user._id.toString(), type: 'refresh' });
  user.refreshTokenHash = hashToken(newRefresh);
  user.refreshTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await user.save();

  const accessToken = signAccessToken({ sub: user._id.toString(), type: 'access' });
  return { user: publicUser(user), memberships: await buildMembershipList(user._id), accessToken, refreshToken: newRefresh };
}

export async function logout(userId) {
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
  await Tenant.updateMany({ ownerUserId: userId, type: 'personal' }, { status: 'suspended' });
}
