import { AuditLog } from '../models/index.js';

export class AuditService {
  /**
   * Fire-and-forget logging.
   */
  static log({ tenantId, userId, action, resource, resourceId, details, ip }) {
    AuditLog.create({
      tenantId,
      userId,
      action,
      resource,
      resourceId,
      details,
      ip,
    }).catch((err) => {
      console.error('[AuditService] Failed to log action:', action, err.message);
    });
  }
}
