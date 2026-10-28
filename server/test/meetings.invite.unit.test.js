/**
 * Meeting invitation links — pure logic (no database).
 *   node --test test/meetings.invite.unit.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
  INVITE_TOKEN_RE,
  checkInvitePassword,
  deriveInviteToken,
  generateInvitePassword,
  hashInvitePassword,
  hashInviteToken,
  invitePath,
  signMeetingPass,
  verifyMeetingPass,
} from '../src/utils/invite.js';
import { verifyAccessToken } from '../src/utils/token.js';
import { phaseOf } from '../src/services/meetingInvite.service.js';

const ID = '66f0c0ffee00000000000001';

test('token: deterministic, url-safe, 43 chars, differs per meeting and per version', () => {
  const a = deriveInviteToken(ID, 1);
  assert.equal(a, deriveInviteToken(ID, 1));
  assert.match(a, INVITE_TOKEN_RE);
  assert.notEqual(a, deriveInviteToken(ID, 2), 'regenerating must change the token');
  assert.notEqual(a, deriveInviteToken('66f0c0ffee00000000000002', 1));
  assert.ok(!a.includes(ID), 'token must not contain the database id');
  assert.equal(invitePath(ID, 1), `/meet/${a}`);
});

test('token hash is stored, not the token', () => {
  const t = deriveInviteToken(ID, 1);
  const h = hashInviteToken(t);
  assert.match(h, /^[a-f0-9]{64}$/);
  assert.notEqual(h, t);
});

test('generated passwords: 8 chars, unambiguous alphabet, not repeated', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    const p = generateInvitePassword();
    assert.match(p, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    seen.add(p);
  }
  assert.ok(seen.size > 190);
});

test('password hashing: bcrypt hash verifies, wrong/empty fail, no hash fails', async () => {
  const hash = await hashInvitePassword('Hunter22');
  assert.notEqual(hash, 'Hunter22');
  assert.equal(await checkInvitePassword('Hunter22', hash), true);
  assert.equal(await checkInvitePassword('hunter22', hash), false);
  assert.equal(await checkInvitePassword('', hash), false);
  assert.equal(await checkInvitePassword('Hunter22', undefined), false);
});

test('meeting pass: round-trips, is bound to a meeting + version, tamper-proof, and is NOT a login token', () => {
  const pass = signMeetingPass({ meetingId: ID, participantId: 'p1', version: 3 });
  const p = verifyMeetingPass(pass);
  assert.equal(p.mid, ID);
  assert.equal(p.pid, 'p1');
  assert.equal(p.v, 3);
  assert.throws(() => verifyMeetingPass(`${pass}x`));
  assert.throws(() => verifyMeetingPass('garbage'));
  // Must never be accepted as an access token (different signing key, no sub).
  assert.throws(() => verifyAccessToken(pass));
  // And a normal access-style token must not be accepted as a pass.
  const forged = jwt.sign({ typ: 'meeting-pass', mid: ID, pid: 'x', v: 1 }, 'dev-only-change-me', { audience: 'lifeos-meeting-pass' });
  assert.throws(() => verifyMeetingPass(forged));
});

test('phase: upcoming / live / ended / cancelled (a missed scheduled meeting counts as ended)', () => {
  const now = new Date('2030-01-15T12:00:00Z');
  const base = { startAt: new Date('2030-01-15T13:00:00Z'), endAt: new Date('2030-01-15T14:00:00Z') };
  assert.equal(phaseOf({ ...base, status: 'scheduled' }, now), 'upcoming');
  assert.equal(phaseOf({ ...base, status: 'live' }, now), 'live');
  assert.equal(phaseOf({ ...base, status: 'completed' }, now), 'ended');
  assert.equal(phaseOf({ ...base, status: 'cancelled' }, now), 'cancelled');
  assert.equal(phaseOf({ ...base, status: 'scheduled' }, new Date('2030-01-15T15:00:00Z')), 'ended');
});
