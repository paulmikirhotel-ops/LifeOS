import { env } from '../config/env.js';
import { signRoomToken } from './livekitToken.js';

/**
 * LiveKit access tokens (video rooms).
 *
 * A LiveKit token is a plain HS256 JWT signed with the project's API secret, so we sign it with
 * node:crypto directly — no extra server dependency. The browser only ever receives the short-lived
 * token and the public server URL; the API key and secret never leave the server.
 *
 * Identity and "host" status are decided HERE, on the server, from the person's verified session or
 * meeting pass. They are stored in the token (identity, name, metadata), which clients cannot change
 * (canUpdateOwnMetadata is not granted), so a participant cannot pretend to be the host.
 */

export function livekitConfigured() {
  const { url, apiKey, apiSecret } = env.livekit;
  return Boolean(url && apiKey && apiSecret);
}

export function roomNameFor(meetingId) {
  return `lifeos-${meetingId}`;
}

/** Token for one person in one meeting's room. `host` is shown to others as the organizer. */
export function mintMeetingRoomToken({ meetingId, identity, name, host = false }) {
  const { apiKey, apiSecret } = env.livekit;
  return signRoomToken({
    apiKey,
    apiSecret,
    room: roomNameFor(meetingId),
    identity,
    name,
    metadata: host ? { h: 1 } : {},
  });
}

/** Browsers need a WebSocket URL; accept the https:// form people often copy from dashboards. */
export function publicLivekitUrl() {
  const raw = (env.livekit.url || '').trim().replace(/\/+$/, '');
  return raw.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://');
}
