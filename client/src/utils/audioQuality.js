/** Voice-quality measuring. Pure functions (no browser needed) so they can be tested. */

export function rateQuality({ lossPct = 0, jitterMs = 0, rttMs = 0 } = {}) {
  if (lossPct > 8 || rttMs > 500 || jitterMs > 80) return 'poor';
  if (lossPct > 3 || rttMs > 250 || jitterMs > 35) return 'fair';
  return 'good';
}

const RANK = { good: 0, fair: 1, poor: 2 };
const worse = (a, b) => (RANK[a] >= RANK[b] ? a : b);

/** LiveKit's own rating of my connection, mapped to ours. */
export function fromLivekit(q) {
  if (q === 'poor') return 'fair';
  if (q === 'lost') return 'poor';
  return 'good';
}

/**
 * Stops the label from flickering: a worse rating needs two samples in a row to show, an improvement shows at once.
 * history = last ratings, newest last.
 */
export function smooth(history) {
  if (!history.length) return 'unknown';
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  if (prev === undefined) return last;
  return RANK[last] > RANK[prev] ? prev : last; // a one-off bad sample is ignored
}

/** Looks through one RTCStatsReport. */
function readReport(report) {
  const out = {};
  report.forEach((s) => {
    if (s.type === 'remote-inbound-rtp' && s.kind === 'audio') {
      out.lossPct = (s.fractionLost || 0) * 100;
      out.rttMs = (s.roundTripTime || 0) * 1000;
      out.jitterMs = (s.jitter || 0) * 1000;
    }
    if (s.type === 'inbound-rtp' && s.kind === 'audio') {
      out.lost = s.packetsLost || 0;
      out.received = s.packetsReceived || 0;
      out.jitterMs = (s.jitter || 0) * 1000;
    }
  });
  return out;
}

/**
 * One measurement of the room: my outgoing voice (loss + round-trip) and everyone's incoming voice (loss since the last sample, jitter).
 * `memo` is a Map kept by the caller so incoming loss is measured over the last few seconds, not since the call began.
 */
export async function measureRoom(room, memo = new Map()) {
  const res = { lossPct: 0, jitterMs: 0, rttMs: 0, sampled: false };
  const lp = room?.localParticipant;
  if (!lp) return res;
  try {
    const sender = lp.getTrackPublication?.('microphone')?.track?.sender;
    if (sender?.getStats) {
      const r = readReport(await sender.getStats());
      if (r.rttMs !== undefined) {
        res.sampled = true;
        res.lossPct = Math.max(res.lossPct, r.lossPct || 0);
        res.rttMs = Math.max(res.rttMs, r.rttMs || 0);
        res.jitterMs = Math.max(res.jitterMs, r.jitterMs || 0);
      }
    }
  } catch {
    /* some browsers do not expose sender stats */
  }
  for (const p of room.remoteParticipants?.values?.() || []) {
    try {
      const track = p.getTrackPublication?.('microphone')?.track;
      if (!track?.receiver?.getStats) continue;
      const r = readReport(await track.receiver.getStats());
      if (r.received === undefined) continue;
      const before = memo.get(p.identity) || { lost: r.lost, received: r.received };
      const dLost = Math.max(0, r.lost - before.lost);
      const dRecv = Math.max(0, r.received - before.received);
      memo.set(p.identity, { lost: r.lost, received: r.received });
      res.sampled = true;
      if (dLost + dRecv > 0) res.lossPct = Math.max(res.lossPct, (dLost / (dLost + dRecv)) * 100);
      res.jitterMs = Math.max(res.jitterMs, r.jitterMs || 0);
    } catch {
      /* skip this speaker */
    }
  }
  return res;
}

/** Final rating of a measurement, also considering LiveKit's own connection-quality signal. */
export function rateMeasurement(m, livekitQuality) {
  const base = m.sampled ? rateQuality(m) : 'good';
  return worse(base, fromLivekit(livekitQuality));
}

export const QUALITY_TEXT = {
  good: 'Voice is clear',
  fair: 'Connection is weak',
  poor: 'Connection is very weak',
  unknown: 'Checking connection…',
};
