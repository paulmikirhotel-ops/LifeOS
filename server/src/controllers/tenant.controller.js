import * as tenantService from '../services/tenant.service.js';

export async function listWorkspaces(req, res) {
  const data = await tenantService.listWorkspaces(req.user.id);
  res.json({ success: true, data: { items: data } });
}

export async function createWorkspace(req, res) {
  const { tenant } = await tenantService.createWorkspace(req.user.id, req.body);
  res.status(201).json({ success: true, data: { tenant } });
}

export async function switchWorkspace(req, res) {
  const data = await tenantService.switchWorkspace(req.user.id, req.body.tenantId);
  res.json({ success: true, data });
}

export async function listMembers(req, res) {
  const data = await tenantService.listMembers(req.user.tenantId);
  res.json({ success: true, data: { items: data } });
}

export async function updateMember(req, res) {
  const data = await tenantService.updateMember(
    req.user.tenantId,
    req.user.id,
    req.params.userId,
    req.body
  );
  res.json({ success: true, data });
}

export async function removeMember(req, res) {
  await tenantService.removeMember(req.user.tenantId, req.user.id, req.params.userId);
  res.json({ success: true, data: { message: 'Member removed' } });
}

export async function inviteMember(req, res) {
  await tenantService.inviteMember(req.user.tenantId, req.user.id, req.body);
  res.status(201).json({ success: true, data: { message: 'Invitation sent' } });
}

export async function resolveInvitation(req, res) {
  const data = await tenantService.resolveInvitation(req.query.token);
  res.json({ success: true, data });
}

export async function acceptInvitation(req, res) {
  const data = await tenantService.acceptInvitation(req.user.id, req.body.token);
  res.json({ success: true, data });
}

export async function getSettings(req, res) {
  res.json({
    success: true,
    data: {
      name: req.tenant.name,
      type: req.tenant.type,
      currency: req.tenant.settings.currency,
      openingBalance: req.tenant.settings.openingBalance,
      workingHours: req.tenant.settings.defaultWorkingHours,
      allowOverlap: req.tenant.settings.allowOverlap,
    },
  });
}

export async function updateSettings(req, res) {
  const tenant = await tenantService.updateSettings(req.user.tenantId, req.body);
  res.json({
    success: true,
    data: {
      name: tenant.name,
      currency: tenant.settings.currency,
      openingBalance: tenant.settings.openingBalance,
      workingHours: tenant.settings.defaultWorkingHours,
      allowOverlap: tenant.settings.allowOverlap,
    },
  });
}
