import * as inviteService from '../services/meetingInvite.service.js';
import { assertObjectId } from '../utils/objectId.js';

/**
 * HTTP layer for meeting invitation links.
 *
 * Two audiences share this controller:
 *   • Public link visitors (no session required) — answered by the handlers at
 *     the top, which rely on `optionalAuth` so a signed-in visitor is recognised
 *     without a signed-out visitor being blocked.
 *   • Organizers and participants inside the app — the handlers at the bottom,
 *     which run behind `authenticate` + `requireTenant` + a permission check.
 */

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const id = (req) => {
  assertObjectId(req.params.id);
  return req.params.id;
};

/**
 * The guest pass.
 *
 * A visitor without an account gets a random token stored in their browser and
 * sent on every request. The server stores only its SHA-256, and uses it solely
 * to recognise the same device again so a returning guest updates their existing
 * attendance row instead of filling the roster with duplicates.
 * It is never an authentication credential and grants no access on its own.
 */
const guestKey = (req) => req.get('x-lifeos-guest') || req.body?.guestKey || null;

// ── public, unauthenticated (optionalAuth) ──────────────────────────────

export async function invitation(req, res) {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
  const data = await inviteService.getInvitation(req.params.code, {
    user: req.user || null,
    hasGuestIdentity: Boolean(guestKey(req)),
  });
  ok(res, data);
}

export async function join(req, res) {
  const data = await inviteService.joinViaInvite(req.params.code, {
    user: req.user || null,
    guestKeyRaw: guestKey(req),
    guestName: req.body?.name,
    guestEmail: req.body?.email,
    requestOnly: req.body?.requestOnly === true,
  });
  ok(res, data, 201);
}

/** Signed-in visitors only — a guest has no LifeOS calendar to write to. */
export async function addToCalendar(req, res) {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Sign in to add this meeting to your LifeOS calendar.',
      code: 'UNAUTHORIZED',
    });
    return;
  }
  ok(res, await inviteService.addInviteToMyCalendar(req.user, req.params.code), 201);
}

// ── organizer: invitation link management ───────────────────────────────

export const inviteInfo = async (req, res) => ok(res, await inviteService.organizerInviteInfo(req.user, id(req)));
export const regenerate = async (req, res) => ok(res, await inviteService.regenerateInvite(req.user, id(req)));
export const revoke = async (req, res) => ok(res, await inviteService.revokeInvite(req.user, id(req)));
export const updateAccess = async (req, res) => ok(res, await inviteService.updateAccess(req.user, id(req), req.body));

// ── attendance ──────────────────────────────────────────────────────────

export const attendance = async (req, res) => ok(res, await inviteService.listAttendance(req.user, id(req)));

export async function reviewAttendance(req, res) {
  assertObjectId(req.params.attendanceId, 'attendanceId');
  ok(
    res,
    await inviteService.reviewAttendance(req.user, id(req), req.params.attendanceId, req.body.decision)
  );
}

export async function removeAttendance(req, res) {
  assertObjectId(req.params.attendanceId, 'attendanceId');
  ok(res, await inviteService.removeAttendance(req.user, id(req), req.params.attendanceId));
}

// ── participant: my invitations & joining from inside the app ───────────

export const myInvitations = async (req, res) => ok(res, await inviteService.listMyInvitations(req.user));

export async function respond(req, res) {
  ok(res, await inviteService.respondToInvitation(req.user, id(req), req.body.response));
}

export const joinMeeting = async (req, res) => ok(res, await inviteService.joinAsMember(req.user, id(req)), 201);

export const leaveMeeting = async (req, res) => ok(res, await inviteService.leaveMeeting(req.user, id(req)));
