// node client/test/audioQuality.test.mjs
import assert from 'node:assert/strict';
import { rateQuality, smooth, fromLivekit, measureRoom, rateMeasurement } from '../src/utils/audioQuality.js';
import { captureOptions, AUDIO_PUBLISH, DEFAULT_PREFS, loadAudioPrefs } from '../src/utils/audioConfig.js';

assert.equal(rateQuality({ lossPct: 0.5, jitterMs: 10, rttMs: 80 }), 'good');
assert.equal(rateQuality({ lossPct: 4 }), 'fair');
assert.equal(rateQuality({ rttMs: 300 }), 'fair');
assert.equal(rateQuality({ lossPct: 12 }), 'poor');
assert.equal(rateQuality({ jitterMs: 90 }), 'poor');

assert.equal(smooth([]), 'unknown');
assert.equal(smooth(['good', 'poor']), 'good', 'a single bad sample is ignored');
assert.equal(smooth(['poor', 'poor']), 'poor', 'two in a row show');
assert.equal(smooth(['poor', 'good']), 'good', 'recovery shows at once');
assert.equal(fromLivekit('lost'), 'poor');
assert.equal(fromLivekit('excellent'), 'good');

// fake room: my sender reports 2% loss / 120 ms; a speaker loses 20 of 100 new packets
const report = (items) => ({ forEach: (f) => items.forEach(f) });
let received = 1000, lost = 0;
const room = {
  localParticipant: { getTrackPublication: () => ({ track: { sender: { getStats: async () => report([{ type: 'remote-inbound-rtp', kind: 'audio', fractionLost: 0.02, roundTripTime: 0.12, jitter: 0.01 }]) } } }) },
  remoteParticipants: new Map([['anna', { identity: 'anna', getTrackPublication: () => ({ track: { receiver: { getStats: async () => report([{ type: 'inbound-rtp', kind: 'audio', packetsLost: lost, packetsReceived: received, jitter: 0.02 }]) } } }) }]]),
};
const memo = new Map();
let m = await measureRoom(room, memo);
assert.equal(m.sampled, true);
assert.ok(Math.abs(m.rttMs - 120) < 1e-6 && Math.abs(m.lossPct - 2) < 1e-6);
received += 80; lost += 20; // next 3 seconds: 20 % lost
m = await measureRoom(room, memo);
assert.ok(Math.abs(m.lossPct - 20) < 1e-6, 'incoming loss is measured over the latest interval');
assert.equal(rateMeasurement(m, 'excellent'), 'poor');
assert.equal(rateMeasurement({ sampled: false }, 'lost'), 'poor');
assert.equal((await measureRoom({}, new Map())).sampled, false, 'no room = no crash');

const c = captureOptions(DEFAULT_PREFS);
assert.equal(c.echoCancellation, true); assert.equal(c.noiseSuppression, true); assert.equal(c.autoGainControl, true);
assert.deepEqual(c.channelCount, { ideal: 1 });
assert.equal(captureOptions({ ...DEFAULT_PREFS, micId: 'abc' }).deviceId.ideal, 'abc');
assert.equal(captureOptions({ ...DEFAULT_PREFS, noiseSuppression: false }).noiseSuppression, false);
assert.equal(AUDIO_PUBLISH.dtx, true); assert.equal(AUDIO_PUBLISH.red, true);
assert.deepEqual(loadAudioPrefs(), DEFAULT_PREFS, 'no storage available = defaults');
console.log('audio quality rules OK');
