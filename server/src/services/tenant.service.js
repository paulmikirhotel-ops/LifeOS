import { ApiError } from '../utils/ApiError.js';
import { Tenant, Membership, Invitation, User } from '../models/index.js';
import { ROLE_PERMISSIONS, hasPermission } from '../config/permissions.js';
import { generateToken, hashToken } from '../utils/token.js';
import { sendMail } from '../utils/mailer.js';
import { env } from '../config/env.js';
import * as notificationService from './notification.service.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function roleDefaultPermissions(role) {
  return [...ROLE_PERMISSIONS[role]];
}

export async function listWorkspaces(userId) {
  return Membership.find({ userId, status: 'active' })
    .populate('tenantId', 'name type settings.status')
    .sort({ createdAt: 1 })
    .lean()
    .then((rows) =>
      rows.map((m) => ({
        tenantId: m.tenantId._id.toString(),
        name: m.tenantId.name,
        type: m.tenantId.type,
        role: m.role,
        permissions: m.permissions,
      }))
    );
}

export async function createWorkspace(userId, { type, name }) {
  if (type === 'personal') {
    const existingPersonal = await Membership.find({ userId }).populate('tenantId').lean();
    const hasPersonal = existingPersonal.some((m) => m.tenantId?.type === 'personal');
    if (hasPersonal) throw ApiError.conflict('A personal workspace already exists');
    const user = await User.findById(userId);
    const tenant = await Tenant.create({ name: name || `${user.name}'s Workspace`, type: 'personal', ownerUserId: userId });
    const membership = await Membership.create({
      tenantId: tenant._id,
      userId,
      role: 'owner',
      permissions: ROLE_PERMISSIONS.owner,
      joinedAt: new Date(),
    });
    return { tenant, membership };
  }

  if (!name?.trim()) throw ApiError.badRequest('Organization name is required');
  const tenant = await Tenant.create({ name: name.trim(), type: 'organization', ownerUserId: userId });
  const membership = await Membership.create({
    tenantId: tenant._id,
    userId,
    role: 'owner',
    permissions: ROLE_PERMISSIONS.owner,
    joinedAt: new Date(),
  });
  return { tenant, membership };
}

export async function switchWorkspace(userId, tenantId) {
  const membership = await Membership.findOne({ tenantId, userId, status: 'active' }).lean();
  if (!membership) throw ApiError.forbidden('Not a member of this workspace');
  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant || tenant.status !== 'active') throw ApiError.notFound('Workspace not found');
  await User.updateOne({ _id: userId }, { activeTenantId: tenantId });
  return {
    tenantId: tenant._id.toString(),
    name: tenant.name,
    type: tenant.type,
    role: membership.role,
    permissions: membership.permissions,
  };
}

export async function updateSettings(tenantId, patch) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw ApiError.notFound('Workspace not found');

  if (typeof patch.name === 'string' && patch.name.trim()) tenant.name = patch.name.trim();
  const s = tenant.settings;
  if (patch.currency) s.currency = String(patch.currency).toUpperCase().slice(0, 3);
  if (typeof patch.openingBalance === 'number' && patch.openingBalance >= 0) {
    s.openingBalance = Math.round(patch.openingBalance * 100) / 100;
  }
  if (patch.allowOverlap === true) s.allowOverlap = true;
  if (patch.allowOverlap === false) s.allowOverlap = false;
  if (patch.workingHours) {
    const startMin = Number(patch.workingHours.startMin);
    const endMin = Number(patch.workingHours.endMin);
    if (Number.isInteger(startMin) && Number.isInteger(endMin) && startMin >= 0 && endMin <= 1439 && startMin < endMin) {
      s.defaultWorkingHours.startMin = startMin;
      s.defaultWorkingHours.endMin = endMin;
    }
    if (Array.isArray(patch.workingHours.days)) s.defaultWorkingHours.days = patch.workingHours.days;
  }
  await tenant.save();
  return tenant;
}

export async function listMembers(tenantId) {
  return Membership.find({ tenantId, status: { $in: ['active', 'suspended'] } })
    .populate('userId', 'name email')
    .lean()
    .then((rows) =>
      rows.map((m) => ({
        id: m._id.toString(),
        userId: m.userId._id.toString(),
        name: m.userId.name,
        email: m.userId.email,
        role: m.role,
        permissions: m.permissions,
        status: m.status,
        joinedAt: m.joinedAt,
      }))
    );
}

export async function updateMember(tenantId, currentUserId, targetUserId, patch) {
  if (targetUserId === currentUserId && patch.role && patch.role !== 'owner') {
    throw ApiError.badRequest('Owners cannot demote themselves');
  }
  const membership = await Membership.findOne({ tenantId, userId: targetUserId });
  if (!membership) throw ApiError.notFound('Member not found');

  if (patch.role) {
    membership.role = patch.role;
    membership.permissions = roleDefaultPermissions(patch.role);
  }
  if (patch.permissions && Array.isArray(patch.permissions)) membership.permissions = patch.permissions;
  if (patch.status && ['active', 'suspended'].includes(patch.status)) membership.status = patch.status;
  await membership.save();
  return membership;
}

export async function removeMember(tenantId, currentUserId, targetUserId) {
  if (targetUserId === currentUserId) throw ApiError.badRequest('Owners cannot remove themselves');
  const membership = await Membership.findOneAndUpdate(
    { tenantId, userId: targetUserId, status: 'active' },
    { status: 'left' },
    { new: true }
  );
  if (!membership) throw ApiError.notFound('Member not found');
}

export async function inviteMember(tenantId, inviterUserId, { email, role, permissions }) {
  const normalized = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalized });
  if (existing) {
    const dup = await Membership.findOne({ tenantId, userId: existing._id, status: { $ne: 'left' } });
    if (dup) throw ApiError.conflict('This user is already a member of the workspace');
  }

  const effectivePermissions = permissions?.length ? permissions : roleDefaultPermissions(role);
  // Never allow granting more than the inviter holds (except owners inviting anyone).
  const inviterMembership = await Membership.findOne({ tenantId, userId: inviterUserId }).lean();
  if (!hasPermission(inviterMembership.permissions, 'users.manage') && inviterMembership.role !== 'owner') {
    throw ApiError.forbidden('Only owners can grant permissions');
  }

  const token = generateToken();
  await Invitation.create({
    tenantId,
    email: normalized,
    role,
    permissions: effectivePermissions,
    tokenHash: hashToken(token),
    invitedBy: inviterUserId,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });

  await notificationService.createNotification({
    tenantId,
    userId: existing?._id,
    type: 'invitation',
    module: 'invitation',
    title: 'Workspace invitation',
    message: 'You were invited to a workspace — accept it to join.',
  });

  await sendMail({
    to: normalized,
    subject: 'LifeOS workspace invitation',
    text: `Join: ${env.clientUrls[0]}/accept-invite?token=${token}`,
  });
  return { sent: true };
}

export async function resolveInvitation(token) {
  const invitation = await Invitation.findOne({ tokenHash: hashToken(token), status: 'pending' });
  if (!invitation) throw ApiError.notFound('Invitation is invalid or already used');
  if (invitation.expiresAt < new Date()) {
    invitation.status = 'expired';
    await invitation.save();
    throw ApiError.badRequest('Invitation has expired');
  }
  const tenant = await Tenant.findById(invitation.tenantId).lean();
  if (!tenant || tenant.status !== 'active') throw ApiError.notFound('Workspace not found');
  return {
    tenantId: tenant._id.toString(),
    tenantName: tenant.name,
    role: invitation.role,
    permissions: invitation.permissions,
    email: invitation.email,
  };
}

export async function acceptInvitation(userId, token) {
  const invitation = await Invitation.findOne({ tokenHash: hashToken(token), status: 'pending' });
  if (!invitation) throw ApiError.notFound('Invitation is invalid or already used');
  if (invitation.expiresAt < new Date()) {
    invitation.status = 'expired';
    await invitation.save();
    throw ApiError.badRequest('Invitation has expired');
  }

  const user = await User.findById(userId);
  if (!user || user.email.toLowerCase() !== invitation.email) {
    throw ApiError.forbidden('This invitation was sent to a different email');
  }

  const membership = await Membership.findOneAndUpdate(
    { tenantId: invitation.tenantId, userId },
    { role: invitation.role, permissions: invitation.permissions, status: 'active', joinedAt: new Date() },
    { upsert: true, new: true }
  );

  invitation.status = 'accepted';
  invitation.acceptedBy = userId;
  await invitation.save();

  // Joining a workspace makes it the active one.
  user.activeTenantId = invitation.tenantId;
  await user.save();

  const tenant = await Tenant.findById(invitation.tenantId).lean();
  return {
    tenantId: tenant._id.toString(),
    name: tenant.name,
    type: tenant.type,
    role: membership.role,
    permissions: membership.permissions,
  };
}
