import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/** Random URL-safe token (email verification / password reset / invitations). */
export function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** One-way hash for storing tokens (never store raw tokens). */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function signAccessToken(payload) {
  return jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, env.jwt.refreshSecret, { expiresIn: env.jwt.refreshExpiresIn });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.secret);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret);
}

export const ACCESS_COOKIE = 'lifeos_access';
export const REFRESH_COOKIE = 'lifeos_refresh';

function cookieBase() {
  return {
    httpOnly: true,
    // Cross-site deployment (frontend on Netlify, API on Render) requires
    // SameSite=None. Browsers refuse Lax cookies on cross-site XHR, which made
    // logins "succeed" while every follow-up request arrived unauthenticated.
    // SameSite=None mandates Secure, which is always on in production.
    sameSite: env.cookie.secure ? 'none' : 'lax',
    secure: env.cookie.secure,
    path: '/',
  };
}

export function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...cookieBase(),
    maxAge: msFromDuration(env.jwt.expiresIn),
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...cookieBase(),
    maxAge: msFromDuration(env.jwt.refreshExpiresIn),
  });
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { ...cookieBase() });
  res.clearCookie(REFRESH_COOKIE, { ...cookieBase() });
}

/** '15m' | '7d' | '1h' → milliseconds. */
export function msFromDuration(duration) {
  const unit = duration.slice(-1);
  const value = parseInt(duration.slice(0, -1), 10);
  const factors = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return (factors[unit] || 1000) * value;
}

/** Extracts the bearer token from the Authorization header (Postman support). */
export function extractBearer(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}
