import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/index.js';
import { env } from '../config/env.js';

/**
 * Blocks a route until the user has verified their email address.
 * Controlled by REQUIRE_EMAIL_VERIFICATION=true; when the flag is off this is a no-op,
 * so installs without working SMTP keep working.
 * Must run after authenticate.
 */
export async function requireVerifiedEmail(req, _res, next) {
  try {
    if (!env.security.requireVerifiedEmail) return next();
    const user = await User.findById(req.user.id).select('isEmailVerified').lean();
    if (!user?.isEmailVerified) {
      throw new ApiError(403, 'Please verify your email address to use this feature', {
        code: 'EMAIL_NOT_VERIFIED',
      });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}
