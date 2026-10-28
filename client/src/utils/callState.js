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
