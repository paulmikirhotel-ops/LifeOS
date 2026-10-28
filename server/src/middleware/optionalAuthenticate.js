import { User } from '../models/index.js';
import { ACCESS_COOKIE, extractBearer, verifyAccessToken } from '../utils/token.js';

/**
 * Like authenticate, but anonymous visitors are allowed through. Used by the public
 * meeting-link endpoints: a signed-in LifeOS user is recognised (req.user = { id, name, email }),
 * anyone else simply has no req.user. An invalid or expired session is treated as anonymous.
 * It sets NO tenant context — link joiners never get workspace access from this.
 */
export async function optionalAuthenticate(req, _res, next) {
  try {
    const raw = req.cookies?.[ACCESS_COOKIE] || extractBearer(req);
    if (raw) {
      const payload = verifyAccessToken(raw);
      const user = await User.findById(payload.sub).select('name email status');
      if (user && user.status !== 'deleted' && user.status !== 'suspended') {
        req.user = { id: user._id.toString(), name: user.name, email: user.email };
      }
    }
  } catch {
    /* anonymous */
  }
  next();
}
