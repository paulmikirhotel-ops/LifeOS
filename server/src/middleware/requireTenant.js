import { ApiError } from '../utils/ApiError.js';
import { Membership, Tenant } from '../models/index.js';

/**
 * THE tenant boundary. Re-verifies against the database on EVERY request that
 * the user holds an ACTIVE membership in the tenant resolved from their session
 * (user.activeTenantId, set at login / workspace switch — never from the client).
 *
 * Sets req.user.tenantId, req.membership (role + effective permissions).
 * Platform admins are NOT tenant members → they get 403 here by design.
 */
export async function requireTenant(req, _res, next) {
  try {
    const tenantId = req.user.activeTenantId;
    if (!tenantId) throw ApiError.forbidden('No active workspace — create or switch to one');

    const [membership, tenant] = await Promise.all([
      Membership.findOne({ tenantId, userId: req.user.id, status: 'active' }).lean(),
      Tenant.findById(tenantId).lean(),
    ]);

    if (!membership || !tenant || tenant.status !== 'active') {
      throw ApiError.forbidden('You are not a member of this workspace');
    }

    req.tenant = tenant;
    req.membership = {
      id: membership._id.toString(),
      role: membership.role,
      permissions: membership.permissions,
    };
    req.user.tenantId = tenantId.toString();
    req.user.permissions = membership.permissions;
    req.user.tenantRole = membership.role;
    next();
  } catch (err) {
    next(err);
  }
}
