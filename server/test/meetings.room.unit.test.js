/**
 * Video room tokens — unit tests (no database, no network, no dependencies).
 *   node --test test/meetings.room.unit.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { signRoomToken } from '../src/utils/livekitToken.js';

const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
const base = { apiKey: 'APIkey123', apiSecret: 'a-very-long-test-secret', room: 'lifeos-abc', identity: 'u:1', name: 'Mary', now: 1_800_000_000_000 };

test('token is a valid HS256 JWT with the claims LiveKit expects', () => {
  const token = signRoomToken({ ...base, metadata: { h: 1 } });
  const [h, p, s] = token.split('.');
  assert.deepEqual(decode(h), { alg: 'HS256', typ: 'JWT' });
  const claims = decode(p);
  assert.equal(claims.iss, 'APIkey123');
  assert.equal(claims.sub, 'u:1');
  assert.equal(claims.name, 'Mary');
  assert.equal(claims.video.room, 'lifeos-abc');
  assert.equal(claims.video.roomJoin, true);
  assert.equal(claims.video.canPublish, true);
  assert.equal(claims.video.canSubscribe, true);
  assert.equal(JSON.parse(claims.metadata).h, 1);
  const expected = crypto.createHmac('sha256', base.apiSecret).update(`${h}.${p}`).digest('base64url');
  assert.equal(s, expected);
});

test('token expires after the TTL and is usable immediately (clock-skew tolerant)', () => {
  const claims = decode(signRoomToken({ ...base, ttlSeconds: 3600 }).split('.')[1]);
  assert.equal(claims.exp - claims.iat, 3600);
  assert.ok(claims.nbf <= claims.iat);
});

test('a different secret produces a different signature (tampering is detectable)', () => {
  const a = signRoomToken(base).split('.')[2];
  const b = signRoomToken({ ...base, apiSecret: 'another-secret' }).split('.')[2];
  assert.notEqual(a, b);
});

test('guests are not marked as host and the name is capped', () => {
  const claims = decode(signRoomToken({ ...base, name: 'x'.repeat(500), metadata: {} }).split('.')[1]);
  assert.equal(JSON.parse(claims.metadata).h, undefined);
  assert.equal(claims.name.length, 80);
});

test('missing credentials, room or identity are rejected', () => {
  assert.throws(() => signRoomToken({ ...base, apiSecret: '' }), /credentials/);
  assert.throws(() => signRoomToken({ ...base, room: '' }), /required/);
  assert.throws(() => signRoomToken({ ...base, identity: '' }), /required/);
});
