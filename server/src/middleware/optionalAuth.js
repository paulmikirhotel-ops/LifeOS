import { User } from '../models/index.js';
import { ACCESS_COOKIE, extractBearer, verifyAccessToken } from '../utils/token.js';

/**
 * Populates `req.user` when a valid session is present, but NEVER rejects.
 *
 * Needed by the meeting invitation link, which must work for three different
 * visitors on the same URL:
 *   • a signed-in LifeOS user (so we can show "Join as Paul" and link the
 *     attendance record to their account),
 *   • a signed-out person who has a LifeOS account (so we can send them to sign
 *     in and back),
 *   • someone who has never used LifeOS (guest join / register).
 *
 * `authenticate` cannot be used here because it throws 401 on a missing or
 * expired token — which would turn a perfectly shareable public link into a
 * login wall. Failure is intentionally silent: an invalid token is simply
 * treated as "not signed in".
 *
 * Note it sets the same shape as `authenticate` minus tenant context —
 * `requireTenant` is what establishes the tenant boundary, and it is NOT applied
 * to these public routes.
 */
export async function optionalAuth(req, _res, next) {
  try {
    const raw = req.cookies?.[ACCESS_COOKIE] || extractBearer(req);
    if (!raw) return next();

    let payload;
    try {
      payload = verifyAccessToken(raw);
    } catch {
      // Expired or tampered token — continue anonymously.
      return next();
    }

    const user = await User.findById(payload.sub).select('name email role status activeTenantId').lean();
    if (!user || user.status !== 'active') return next();

    req.user = {
      id: String(user._id),
      email: user.email,
      name: user.name,
      platformRole: user.role,
      activeTenantId: user.activeTenantId ? String(user.activeTenantId) : null,
    };
  } catch {
    // Never block a public page because of an auth-side problem.
  }
  next();
}

export default optionalAuth;
