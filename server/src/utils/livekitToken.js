import crypto from 'node:crypto';

/**
 * Pure LiveKit access-token signer (no environment access, so it is unit-testable).
 * A LiveKit token is a plain HS256 JWT signed with the project's API secret.
 */

const b64u = (input) => Buffer.from(input).toString('base64url');
const DEFAULT_TTL_SECONDS = 4 * 60 * 60;

/** Pure signer (no env access) so it can be unit-tested. */
export function signRoomToken({ apiKey, apiSecret, room, identity, name, metadata, ttlSeconds = DEFAULT_TTL_SECONDS, now = Date.now() }) {
  if (!apiKey || !apiSecret) throw new Error('LiveKit credentials are missing');
  if (!room || !identity) throw new Error('room and identity are required');
  const iat = Math.floor(now / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: apiKey,
    sub: identity,
    jti: identity,
    name: String(name || 'Guest').slice(0, 80),
    metadata: JSON.stringify(metadata || {}),
    iat,
    nbf: iat - 30, // tolerate small clock differences between our server and LiveKit
    exp: iat + ttlSeconds,
    video: {
      room,
      roomJoin: true,
      canSubscribe: true,
      canPublish: true,
      canPublishData: true,
    },
  };
  const unsigned = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  const signature = crypto.createHmac('sha256', apiSecret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}
