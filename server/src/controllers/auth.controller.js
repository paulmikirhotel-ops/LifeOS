import * as authService from '../services/auth.service.js';
import { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } from '../utils/token.js';

export async function register(req, res) {
  const { user } = await authService.register(req.body);
  const session = await authService.startSession(user);
  setAuthCookies(res, session.accessToken, session.refreshToken);
  res.status(201).json({ success: true, data: { user: session.user, memberships: session.memberships } });
}

export async function login(req, res) {
  const session = await authService.login(req.body);
  setAuthCookies(res, session.accessToken, session.refreshToken);
  res.json({ success: true, data: { user: session.user, memberships: session.memberships } });
}

export async function logout(req, res) {
  await authService.logout(req.user.id);
  clearAuthCookies(res);
  res.json({ success: true, data: { message: 'Logged out' } });
}

export async function refresh(req, res) {
  const session = await authService.refreshSession(req.cookies?.[REFRESH_COOKIE]);
  setAuthCookies(res, session.accessToken, session.refreshToken);
  res.json({ success: true, data: { user: session.user, memberships: session.memberships } });
}

export async function me(req, res) {
  const data = await authService.me(req.user.id);
  res.json({ success: true, data });
}

export async function changePassword(req, res) {
  await authService.changePassword(req.user.id, req.body);
  res.json({ success: true, data: { message: 'Password changed' } });
}

export async function forgotPassword(req, res) {
  await authService.forgotPassword(req.body.email);
  res.json({ success: true, data: { message: 'If that email exists, a reset link has been sent' } });
}

export async function resetPassword(req, res) {
  await authService.resetPassword(req.body.token, req.body.newPassword);
  res.json({ success: true, data: { message: 'Password reset — you can now log in' } });
}

export async function verifyEmail(req, res) {
  await authService.verifyEmail(req.body.token);
  res.json({ success: true, data: { message: 'Email verified' } });
}

export async function deleteAccount(req, res) {
  await authService.deleteAccount(req.user.id);
  clearAuthCookies(res);
  res.json({ success: true, data: { message: 'Account deleted' } });
}
