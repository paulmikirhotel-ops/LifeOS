import { ApiError } from '../utils/ApiError.js';
import { hasPermission } from '../config/permissions.js';

/**
 * Factory middleware: requirePermission('finance.create').
 * Owners ('*') always pass. Platform admins never reach here (requireTenant fails first).
 */
export function requirePermission(permission) {
  return (req, _res, next) => {
    const perms = req.user?.permissions || req.membership?.permissions || [];
    if (hasPermission(perms, permission)) return next();
    next(ApiError.forbidden(`Missing permission: ${permission}`));
  };
}
