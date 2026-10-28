// node client/test/callState.test.mjs
import assert from 'node:assert/strict';
import { callPhase, phaseText, endedText, formatDuration, pickMain, busyPath } from '../src/utils/callState.js';

assert.equal(callPhase({ status: 'idle', remoteCount: 0 }), 'connecting');
assert.equal(callPhase({ status: 'connected', remoteCount: 0, everConnected: false }), 'calling');
assert.equal(callPhase({ status: 'connected', remoteCount: 1 }), 'live');
assert.equal(callPhase({ status: 'connected', remoteCount: 0, everConnected: true }), 'waiting');
assert.equal(callPhase({ status: 'reconnecting', remoteCount: 1 }), 'reconnecting');
assert.equal(callPhase({ status: 'connected', remoteCount: 1, ended: true }), 'ended');
assert.equal(callPhase({ status: 'error' }), 'error');
assert.equal(phaseText('calling'), 'Calling…');
assert.equal(phaseText('calling', { group: true }), 'Ringing…');
assert.equal(endedText(false), 'No answer');
assert.equal(endedText(true), 'Call ended');
assert.equal(formatDuration(5), '0:05');
assert.equal(formatDuration(65), '1:05');
assert.equal(formatDuration(3725), '1:02:05');
assert.equal(formatDuration(-3), '0:00');

const a = { identity: 'a', isLocal: false, camOn: true, camTrack: {}, isSpeaking: false };
const b = { identity: 'b', isLocal: false, camOn: true, camTrack: {}, isSpeaking: true };
const me = { identity: 'me', isLocal: true, camOn: true, camTrack: {}, isSpeaking: true };
assert.equal(pickMain([me, a, b]).identity, 'b', 'speaker with camera wins');
assert.equal(pickMain([me, a]).identity, 'a');
assert.equal(pickMain([me, { ...a, camOn: false }]), null, 'no remote camera = avatars');

assert.equal(busyPath('/connect/call/abc'), true);
assert.equal(busyPath('/meetings/65f1/room'), true);
assert.equal(busyPath('/meet/tok/room'), true);
assert.equal(busyPath('/connect/chats'), false);
assert.equal(busyPath('/'), false);
console.log('call state rules OK');
