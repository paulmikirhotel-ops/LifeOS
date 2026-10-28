// node client/test/ringtone.test.mjs : only one ring loop can ever exist; stop silences at once.
import assert from 'node:assert/strict';
let created = 0, started = 0, stopped = 0, vib = [];
class Param { setValueAtTime() {} linearRampToValueAtTime() {} }
class FakeCtx {
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; created += 1; }
  createGain() { return { gain: Object.assign(new Param(), { value: 0 }), connect() {} }; }
  createOscillator() { return { frequency: {}, connect() {}, start() { started += 1; }, stop() { stopped += 1; } }; }
  resume() { return Promise.resolve(); }
}
globalThis.window = { AudioContext: FakeCtx, addEventListener() {}, navigator: { vibrate: (p) => vib.push(p) } };
const intervals = new Set();
const realSet = globalThis.setInterval, realClear = globalThis.clearInterval;
globalThis.setInterval = (f, ms) => { const id = realSet(f, 1e9); intervals.add(id); return id; };
globalThis.clearInterval = (id) => { intervals.delete(id); realClear(id); };
const { startRingtone, stopRingtone, ringing } = await import('../src/utils/ringtone.js');

startRingtone('incoming');
startRingtone('incoming');
startRingtone('incoming');
assert.equal(intervals.size, 1, 'three starts, one loop');
assert.equal(created, 1, 'one audio context');
assert.equal(ringing(), 'incoming');
assert.ok(started >= 4, 'two bursts of two tones');
startRingtone('ringback');
assert.equal(intervals.size, 1, 'switching sound replaces the loop');
assert.equal(ringing(), 'ringback');
stopRingtone();
assert.equal(intervals.size, 0, 'stop clears the loop');
assert.equal(ringing(), null);
assert.ok(stopped > 0, 'sounding tones are cut off at once');
assert.deepEqual(vib.at(-1), 0, 'vibration cancelled');
stopRingtone(); // safe to call again
startRingtone('nonsense');
assert.equal(ringing(), null, 'unknown sound ignored');
for (const id of [...intervals]) globalThis.clearInterval(id);
console.log('ringtone rules OK');
