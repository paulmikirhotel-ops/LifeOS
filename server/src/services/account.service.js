import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { User, Tenant } from '../models/index.js';
import { generateToken, hashToken } from '../utils/token.js';
import { sendMail } from '../utils/mailer.js';
import { env } from '../config/env.js';
import * as authService from './auth.service.js';
import { removeAllForUser as removePush } from './push.service.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SECRET_KEY = /hash|token|secret|password|^(p256dh|auth|endpoint)$/i;
// Fields that mean "this record belongs to / was made by this user" across the models.
const OWNER_FIELDS = ['userId', 'createdBy', 'authorId', 'organizerId', 'senderId', 'requesterId', 'ownerId', 'ownerUserId'];
const EXPORT_CAP = 5000; // documents per collection

async function checkPassword(userId, password) {
  if (!password) throw ApiError.badRequest('Password is required');
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw ApiError.badRequest('Password is incorrect');
  return user;
}

/** Removes anything secret-looking, ids become strings. Safe for a file the user downloads. */
export function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    if (value instanceof Date) return value;
    if (typeof value.toHexString === 'function') return value.toHexString();
    const out = {};
    for (const [k, v] of Object.entries(value)) if (!SECRET_KEY.test(k)) out[k] = scrub(v);
    return out;
  }
  return value;
}

/** Everything we hold that belongs to this user, as one JSON-able object. */
export async function exportData(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw ApiError.notFound('User not found');
  const out = {
    exportedAt: new Date().toISOString(),
    note: 'Your LifeOS data. Files (recordings, attachments) are not included; ask support if you need them.',
    account: scrub({ name: user.name, email: user.email, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt, notificationPrefs: user.notificationPrefs }),
    data: {},
  };
  for (const [name, Model] of Object.entries(mongoose.models)) {
    if (name === 'User') continue;
    const field = OWNER_FIELDS.find((f) => Model.schema.path(f));
    if (!field) continue;
    try {
      const docs = await Model.find({ [field]: userId }).limit(EXPORT_CAP).lean();
      if (docs.length) out.data[name] = scrub(docs);
    } catch {
      /* one broken collection must not block the export */
    }
  }
  return out;
}

/** Ends every session: refresh token removed and every access token issued before now stops working. */
export async function signOutEverywhere(userId) {
  await removePush(userId);
  await User.updateOne({ _id: userId }, { $set: { tokenValidAfter: new Date() }, $unset: { refreshTokenHash: 1, refreshTokenExpiresAt: 1 } });
}

export async function requestEmailChange(userId, { password, newEmail }) {
  const user = await checkPassword(userId, password);
  const email = String(newEmail || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) throw ApiError.badRequest('Enter a valid email address');
  if (email === user.email) throw ApiError.badRequest('That is already your email');
  if (await User.exists({ email })) throw ApiError.conflict('That email is already in use');
  const token = generateToken();
  user.pendingEmail = email;
  user.pendingEmailTokenHash = hashToken(token);
  user.pendingEmailExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();
  const link = `${env.clientUrls[0]}/confirm-email-change?token=${token}`;
  await sendMail({ to: email, subject: 'Confirm your new LifeOS email', text: `Confirm this as your new LifeOS email (valid 1 hour): ${link}\n\nIf you did not ask for this, ignore this email.` });
  await sendMail({ to: user.email, subject: 'LifeOS email change requested', text: `Someone asked to change your LifeOS email to ${email}. If this was not you, change your password now.` });
}

export async function confirmEmailChange(token) {
  if (!token) throw ApiError.badRequest('Token is required');
  const user = await User.findOne({ pendingEmailTokenHash: hashToken(token) }).select('+pendingEmailTokenHash');
  if (!user || !user.pendingEmail || !user.pendingEmailExpiresAt || user.pendingEmailExpiresAt < new Date()) {
    throw ApiError.badRequest('This link is invalid or has expired');
  }
  if (await User.exists({ email: user.pendingEmail, _id: { $ne: user._id } })) throw ApiError.conflict('That email is already in use');
  user.email = user.pendingEmail;
  user.isEmailVerified = true;
  user.pendingEmail = undefined;
  user.pendingEmailTokenHash = undefined;
  user.pendingEmailExpiresAt = undefined;
  user.tokenValidAfter = new Date(); // sign in again with the new address
  user.refreshTokenHash = undefined;
  await user.save();
}

/** Password-checked account deletion: existing safe soft-delete, then wipes the user's personal workspace content. */
export async function deleteAccountWithPassword(userId, { password }) {
  await checkPassword(userId, password);
  const personal = await Tenant.find({ ownerUserId: userId, type: 'personal' }).select('_id').lean();
  await authService.deleteAccount(userId); // throws 409 if an organization with other members is still owned
  await removePush(userId);
  await User.updateOne({ _id: userId }, { $set: { tokenValidAfter: new Date() }, $unset: { pendingEmail: 1, pendingEmailTokenHash: 1 } });
  const ids = personal.map((t) => t._id);
  if (!ids.length) return;
  for (const [name, Model] of Object.entries(mongoose.models)) {
    if (['User', 'Tenant', 'Membership'].includes(name)) continue;
    if (!Model.schema.path('tenantId')) continue;
    try {
      await Model.deleteMany({ tenantId: { $in: ids } });
    } catch (err) {
      console.error(`[account] could not purge ${name}:`, err.message);
    }
  }
}
