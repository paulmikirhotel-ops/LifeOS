/** Pure helpers for Connect calls (no database), so they can be unit-tested. */

export const RING_MS = 45_000; // how long a call rings
export const STALE_MS = 75_000; // a joined person with no heartbeat for this long is treated as gone (heartbeat is every 20 s)
export const MAX_ON_CALL = 8;

export const modeLabel = (mode) => (mode === 'video' ? 'Video call' : 'Voice call');

export function durationText(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total} sec`;
  const m = Math.floor(total / 60);
  const rest = total % 60;
  if (m < 10) return rest ? `${m} min ${rest} sec` : `${m} min`;
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** The line shown in the chat when a call is over. */
export function callLogText({ mode, reason, startedAt, endedAt }) {
  const label = modeLabel(mode);
  if (reason === 'completed' && startedAt && endedAt) return `${label} · ${durationText(new Date(endedAt) - new Date(startedAt))}`;
  if (reason === 'declined') return `${label} declined`;
  return `Missed ${label.toLowerCase()}`; // missed, cancelled, or completed without anyone answering
}

/** Should the call end now? `joined` = people currently connected. */
export function shouldEnd({ status, joined, callerJoined }) {
  if (status === 'ringing') return !callerJoined; // the caller hung up before anyone answered
  if (status === 'active') return joined <= 1; // nobody left to talk to
  return false;
}

/** Every invited person has said no (so a ringing group call can stop ringing). */
export const allDeclined = (invited, declined) => invited.length > 0 && invited.every((i) => declined.map(String).includes(String(i)));

export const isRingExpired = (createdAt, now = Date.now()) => now - new Date(createdAt).getTime() > RING_MS;
