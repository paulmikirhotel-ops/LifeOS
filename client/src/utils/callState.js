/** Plain rules for the Connect call screen, kept apart from the screen so they can be tested. */

/** What the screen should show. status is the room hook's status. */
export function callPhase({ status, remoteCount, everConnected, ended }) {
  if (ended || status === 'disconnected') return 'ended';
  if (status === 'error') return 'error';
  if (status === 'idle' || status === 'connecting') return 'connecting';
  if (status === 'reconnecting') return 'reconnecting';
  if (remoteCount > 0) return 'live';
  return everConnected ? 'waiting' : 'calling';
}

export const phaseText = (phase, { group = false } = {}) =>
  ({ connecting: 'Connecting…', calling: group ? 'Ringing…' : 'Calling…', waiting: 'Waiting for others…', reconnecting: 'Reconnecting…', ended: 'Call ended', error: 'Could not connect' }[phase] || '');

export const endedText = (everConnected) => (everConnected ? 'Call ended' : 'No answer');

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** The person to show big on a video call: someone speaking with a camera, else anyone with a camera, else nobody (show avatars). */
export function pickMain(participants) {
  const remotes = participants.filter((p) => !p.isLocal && p.camOn && p.camTrack);
  return remotes.find((p) => p.isSpeaking) || remotes[0] || null;
}

/** Should a ringing call make sound / take over the screen? Never while I'm already in a call or meeting (the ring would leak into the microphone). */
export function busyPath(pathname) {
  return /^\/connect\/call\//.test(pathname) || /^\/meetings\/[^/]+\/(room|live)/.test(pathname) || /^\/meet\/[^/]+\/room/.test(pathname);
}

/* ── Incoming-call bookkeeping ─────────────────────────────────────────────────
 * Pure rules (no React) so they can be tested. They decide which ringing call is on screen, so that
 *  - the same call is never shown twice (a repeated event, or a poll that crosses an event),
 *  - a call I already answered, declined or let ring out never comes back,
 *  - the "ring time is over" moment does not depend on the phone's clock being right.
 */

/** How often the app double-checks for a ringing call, in case the live connection is slow or blocked. */
export const CALL_CHECK_MS = 8000;
/** A call that arrived this recently is kept even if one check says "nothing ringing" (the check may be older than the event). */
export const INCOMING_GRACE_MS = 6000;
const DEFAULT_RING_MS = 30000;

/**
 * Adds the two moments the screen needs: when it was first shown, and when it must go away.
 * The server sends how many milliseconds of ringing are left (ringLeftMs), measured on ITS clock; we add that to
 * OUR clock now. Using the server's absolute time instead would break on any phone whose clock is wrong.
 */
export function stampCall(call, now = Date.now()) {
  if (!call) return null;
  let left = Number.isFinite(call.ringLeftMs) ? call.ringLeftMs : new Date(call.ringingUntil).getTime() - now;
  if (!Number.isFinite(left)) left = DEFAULT_RING_MS;
  return { ...call, shownAt: now, expiresAt: now + Math.max(0, left) };
}

/**
 * The call that should be on screen after asking the server "is anything ringing for me?".
 * `fromServer` is the call the server returned, or null. `dismissed` is a Set of call ids I am done with.
 */
export function nextIncoming({ current, fromServer, dismissed, now = Date.now() }) {
  const server = fromServer && !(dismissed && dismissed.has(fromServer.id)) ? fromServer : null;
  if (server) return current && current.id === server.id ? current : stampCall(server, now);
  if (current && now - (current.shownAt || 0) < INCOMING_GRACE_MS) return current;
  return null;
}

/** The call that should be on screen after a live "incoming" event. Returns `current` unchanged when the event must be ignored. */
export function acceptIncomingEvent({ current, call, dismissed, myId, now = Date.now() }) {
  if (!call || !call.id || call.status === 'ended') return current;
  if (myId != null && String(call.callerId) === String(myId)) return current; // my own outgoing call never rings me
  if (dismissed && dismissed.has(call.id)) return current;
  if (current && current.id === call.id) return current; // the same event delivered twice: one screen, one ring
  return stampCall(call, now);
}
