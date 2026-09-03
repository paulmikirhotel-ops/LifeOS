import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/index.js';
import { ACCESS_COOKIE, extractBearer, verifyAccessToken } from '../utils/token.js';

/**
 * Authenticates the request: reads the access JWT from the lifeos_access cookie
 * or the Authorization: Bearer header, loads the user, and sets:
 *   req.user = { id, email, name, platformRole, activeTenantId }
 * Platform-level only — tenant membership is verified by requireTenant.
 */
export async function authenticate(req, _res, next) {
  try {
    const raw = req.cookies?.[ACCESS_COOKIE] || extractBearer(req);
    if (!raw) throw ApiError.unauthorized('Authentication required');

    let payload;
    try {
      payload = verifyAccessToken(raw);
    } catch {
      throw ApiError.unauthorized('Session expired or invalid');
    }

    const user = await User.findById(payload.sub).select('+passwordHash');
    if (!user || user.status === 'deleted') {
      throw ApiError.unauthorized('Account no longer exists');
    }
    if (user.status === 'suspended') {
      throw ApiError.forbidden('Account suspended');
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      platformRole: user.role,
      activeTenantId: user.activeTenantId ? user.activeTenantId.toString() : null,
    };
    next();
  } catch (err) {
    next(err);
  }
}
