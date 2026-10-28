/**
 * Recording segments (pure helpers, no database or network).
 *
 * One meeting recording can be made of several segments: whenever a different person (or the same
 * person after a reload) takes over recording, a NEW browser recording starts, with its own audio
 * header. Chunk indexes already exist as one flat number per meeting, so a segment simply owns a
 * block of indexes: segment N uses N*STRIDE .. N*STRIDE+STRIDE-1. Segment 0 is the original
 * single-recorder flow, so old recordings and the old flow behave exactly as before.
 */

export const STRIDE = 5000; // about 13.9 hours per segment at 10 s per chunk
export const RECORDER_STALE_MS = 45_000; // a recorder that has sent nothing for this long is gone

export const segmentOf = (index) => Math.floor(index / STRIDE);
export const localIndex = (index) => index % STRIDE;
export const startIndexFor = (segment) => segment * STRIDE;

/** Groups received chunk indexes by segment: [{ segment, indexes: [sorted] }] ordered by segment. */
export function groupBySegment(seen = []) {
  const map = new Map();
  [...new Set(seen)]
    .filter((i) => Number.isInteger(i) && i >= 0)
    .sort((a, b) => a - b)
    .forEach((i) => {
      const s = segmentOf(i);
      if (!map.has(s)) map.set(s, []);
      map.get(s).push(i);
    });
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([segment, indexes]) => ({ segment, indexes }));
}

/** Everyone who may record is identified by one string: `u:<userId>` (workspace member) or `g:<random>` (link joiner). */
const whoIds = (active) => [active?.key, active?.userId && String(active.userId), active?.userId && `u:${active.userId}`].filter(Boolean).map(String);

/** Is `who` (a key like `u:123`/`g:abc`, or a bare user id) the person who holds the recorder slot? */
export function isSameRecorder(active, who) {
  return Boolean(active && who && whoIds(active).includes(String(who)));
}

/** True when nobody is really recording any more (no recorder, or it went silent). */
export function isRecorderStale(active, now = Date.now()) {
  if (!active || !(active.key || active.userId)) return true;
  const t = active.heartbeatAt ? new Date(active.heartbeatAt).getTime() : 0;
  return now - t > RECORDER_STALE_MS;
}

/** May this person start recording right now? The same person may always re-claim (reload). */
export function claimDecision({ active, who, userId, now = Date.now() }) {
  const me = who ?? userId;
  if (!active || !(active.key || active.userId)) return { ok: true };
  if (isSameRecorder(active, me)) return { ok: true };
  if (isRecorderStale(active, now)) return { ok: true, takeover: true };
  return { ok: false, by: active.name || 'Another participant' };
}

/** May this person upload a chunk? Only the current recorder, or the organizer in the old flow (no claim at all). */
export function uploadDecision({ active, who, userId, isOrganizer, now = Date.now() }) {
  const me = who ?? userId;
  if (active && (active.key || active.userId)) {
    if (isSameRecorder(active, me)) return { ok: true, heartbeat: true };
    if (isRecorderStale(active, now) && isOrganizer) return { ok: true, legacy: true };
    return { ok: false };
  }
  return isOrganizer ? { ok: true, legacy: true } : { ok: false };
}

/**
 * What the room shows about recording, from one person's point of view.
 *  recording: someone is genuinely recording (a fresh recorder, or the old single-recorder flow)
 *  recorder:  null when nobody holds the slot; { name, mine, stale, paused } otherwise
 */
export function recordingView({ recording = {}, who, now = Date.now() }) {
  const active = recording.activeRecorder;
  const hasActive = Boolean(active && (active.key || active.userId));
  const stale = hasActive ? isRecorderStale(active, now) : true;
  const newFlow = (recording.segmentCount || 0) > 0;
  const on = newFlow ? hasActive && !stale : recording.status === 'recording';
  return {
    recording: on,
    recorder: hasActive
      ? { name: active.name || 'A participant', mine: isSameRecorder(active, who), stale, paused: Boolean(active.paused) && !stale }
      : null,
  };
}
