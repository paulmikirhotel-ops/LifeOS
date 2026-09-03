import { AdminService } from '../services/admin.service.js';

/** Platform admin endpoints — platform entities and AGGREGATES ONLY (no tenant data). */
export async function getStats(_req, res) {
  const data = await AdminService.getPlatformStats();
  res.json({ success: true, data });
}

export async function listUsers(req, res) {
  const data = await AdminService.listUsers(req.query);
  res.json({ success: true, data });
}

export async function setUserStatus(req, res) {
  const data = await AdminService.setUserStatus(req.params.userId, req.body.status);
  res.json({ success: true, data });
}

export async function listTenants(req, res) {
  const data = await AdminService.listTenants(req.query);
  res.json({ success: true, data });
}

export async function setTenantStatus(req, res) {
  const data = await AdminService.setTenantStatus(req.params.tenantId, req.body.status);
  res.json({ success: true, data });
}
