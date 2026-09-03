import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
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
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { success: false, message: 'Too many requests, please try again later', code: 'RATE_LIMITED' },
    })
  );

  // ── Routes ──────────────────────────────────────────────────────────
  app.use('/api', apiRoutes);

  // ── 404 + error envelope (order matters: error handler last) ────────
  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
