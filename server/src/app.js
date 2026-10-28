import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { invalidateOnWrite } from './utils/cache.js';
import apiRoutes from './routes/index.js';
import { notFoundHandler } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

/**
 * Express app factory — kept separate from the bootstrap (src/index.js)
 * so tests can import the app without opening a port.
 */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render/Vercel sit behind a proxy

  // ── Security headers ────────────────────────────────────────────────
  app.use(helmet());

  // ── CORS: explicit origin allowlist (never "*" with credentials) ────
  app.use(
    cors({
      origin: env.clientUrls,
      credentials: true,
      exposedHeaders: ['Idempotent-Replay', 'Retry-After'],
    })
  );

  // ── Body parsing + cookies ──────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // ── Request logging ─────────────────────────────────────────────────
  app.use(morgan(env.isProd ? 'combined' : 'dev'));

  // ── Base rate limit (per IP) ────────────────────────────────────────
  // Fine-tuned per route later (auth gets stricter limits in Phase 3).
  // No global request limiter (login, public links and uploads keep their own route limits).
  app.use('/api', invalidateOnWrite); // clears a user's cached reads after any successful write

  // ── Routes ──────────────────────────────────────────────────────────
  app.use('/api', apiRoutes);

  // ── 404 + error envelope (order matters: error handler last) ────────
  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
