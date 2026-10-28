import * as account from '../services/account.service.js';
import { clearAuthCookies } from '../utils/token.js';

export async function exportMine(req, res) {
  const data = await account.exportData(req.user.id);
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="lifeos-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.set('Cache-Control', 'no-store');
  res.send(JSON.stringify(data, null, 2));
}

export async function signOutEverywhere(req, res) {
  await account.signOutEverywhere(req.user.id);
  clearAuthCookies(res);
  res.json({ success: true, data: { message: 'Signed out of all devices' } });
}

export async function changeEmail(req, res) {
  await account.requestEmailChange(req.user.id, req.body);
  res.json({ success: true, data: { message: 'Check your new email for a confirmation link' } });
}

export async function confirmEmail(req, res) {
  await account.confirmEmailChange(req.body.token);
  res.json({ success: true, data: { message: 'Email updated. Please sign in again.' } });
}

export async function deleteMine(req, res) {
  await account.deleteAccountWithPassword(req.user.id, req.body);
  clearAuthCookies(res);
  res.json({ success: true, data: { message: 'Account deleted' } });
}
