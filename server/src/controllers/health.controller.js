import { dbState } from '../config/db.js';
import { env } from '../config/env.js';

/** GET /api/health — liveness probe (public, no auth). */
export function getHealth(_req, res) {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      service: 'lifeos-api',
      environment: env.nodeEnv,
      uptimeSeconds: Math.round(process.uptime()),
      database: dbState(),
      timestamp: new Date().toISOString(),
    },
  });
}
