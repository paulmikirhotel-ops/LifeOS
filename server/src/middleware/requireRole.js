import { ApiError } from '../utils/ApiError.js';

/** requireRole('platform-admin') — platform-level role gate (admin routes). */
export function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (allowedRoles.includes(req.user?.platformRole)) return next();
    next(ApiError.forbidden('Not allowed'));
  };
}
