/**
 * LifeOS API server — bootstrap.
 * Loads env → connects MongoDB → starts Express.
 * Production exits when the database is unreachable (host restarts us);
 * development keeps serving so /api/health reports the DB state.
 */
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';
import { startScheduler, stopScheduler } from './services/scheduler.service.js';

const app = createApp();

try {
  await connectDB();
} catch (err) {
  console.error(`[db] initial connection failed: ${err.message}`);
  if (env.isProd) {
    console.error('[startup] exiting: no database in production');
    process.exit(1);
  }
  console.warn('[startup] running without database (development) — /api/health shows the state');
}

const server = app.listen(env.port, () => {
  console.log(`[lifeos-api] listening on http://localhost:${env.port} (${env.nodeEnv})`);
});

// Reminder scheduler (tick every 60s; safe when the DB is not connected yet).
startScheduler();

// ── Graceful shutdown ───────────────────────────────────────────────
async function shutdown(signal) {
  console.log(`[lifeos-api] ${signal} received — shutting down`);
  stopScheduler();
  server.close(async () => {
    try {
      await disconnectDB();
    } catch (err) {
      console.error(`[shutdown] db disconnect error: ${err.message}`);
    }
    process.exit(0);
  });
  // Force-exit if connections refuse to close.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
