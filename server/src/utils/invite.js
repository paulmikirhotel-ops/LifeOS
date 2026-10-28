import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Meeting invitation links.
 *
 *  • The link token is DERIVED (HMAC-SHA256 of meetingId + version, keyed by a server secret),
 *    so it is unguessable, can be shown to the organizer again at any time, and is never stored
 *    in clear: the database only holds its SHA-256 hash (used for lookup).
 *  • "Regenerate link" bumps the version → a new token, and every old link/pass dies.
 *  • The join password is stored as a bcrypt hash only.
 *  • After a correct password the server issues a short-lived "meeting pass" that is valid for ONE
 *    meeting only. It is signed with a key derived from (but different to) the JWT secret, so it
 *    can never be accepted as a LifeOS login token.
 */

export const INVITE_ACCESS_MODES = ['link', 'authenticated', 'restricted'];
export const INVITE_PASSWORD_MIN = 6;
export const INVITE_PASSWORD_MAX = 64;
export const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L confusion
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data);

export function deriveInviteToken(meetingId, version = 1) {
  return hmac(env.invite.tokenSecret, `meeting-invite:v1:${meetingId}:${version}`).digest('base64url');
}

export function hashInviteToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function invitePath(meetingId, version = 1) {
  return `/meet/${deriveInviteToken(meetingId, version)}`;
}

export function generateInvitePassword(length = 8) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += PASSWORD_ALPHABET[crypto.randomInt(PASSWORD_ALPHABET.length)];
  return out;
}

export const hashInvitePassword = (plain) => bcrypt.hash(String(plain), 10);
export const checkInvitePassword = (plain, hash) => (hash ? bcrypt.compare(String(plain), hash) : Promise.resolve(false));

/** Fields stored on Meeting.invite when a link is created. */
export function buildInviteFields(meetingId, { passwordHash, accessMode = 'link', version = 1 }) {
  return {
    tokenHash: hashInviteToken(deriveInviteToken(meetingId, version)),
    version,
    enabled: true,
    accessMode,
    passwordHash,
    failedAttempts: 0,
    createdAt: new Date(),
  };
}

// ── meeting pass ────────────────────────────────────────────────────────

const passKey = () => hmac(env.invite.tokenSecret, 'meeting-pass:v1').digest();

export function signMeetingPass({ meetingId, participantId, version }) {
  return jwt.sign({ typ: 'meeting-pass', mid: String(meetingId), pid: String(participantId), v: version }, passKey(), {
    expiresIn: env.invite.passTtl,
    audience: 'lifeos-meeting-pass',
  });
}

export function verifyMeetingPass(token) {
  const payload = jwt.verify(String(token), passKey(), { audience: 'lifeos-meeting-pass' });
  if (payload.typ !== 'meeting-pass') throw new Error('wrong token type');
  return payload;
}
