/** Hand-off recording rules for members AND link joiners. node --test test/recording.handoff.unit.test.js */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isSameRecorder, claimDecision, uploadDecision, recordingView, RECORDER_STALE_MS } from '../src/services/recordingSegments.js';

const NOW = 2_000_000_000;
const guest = { key: 'g:abc', name: 'Guest Gina', heartbeatAt: NOW - 1000 };
const member = { key: 'u:111', userId: '111', name: 'Mara', heartbeatAt: NOW - 1000 };
const oldSlot = { userId: '111', name: 'Mara', heartbeatAt: NOW - 1000 }; // written before link joiners could record

test('isSameRecorder matches keys, user ids and old slots', () => {
  assert.equal(isSameRecorder(guest, 'g:abc'), true);
  assert.equal(isSameRecorder(guest, 'g:zzz'), false);
  assert.equal(isSameRecorder(member, 'u:111'), true);
  assert.equal(isSameRecorder(member, '111'), true);
  assert.equal(isSameRecorder(oldSlot, 'u:111'), true);
  assert.equal(isSameRecorder(null, 'u:111'), false);
});

test('a guest can record; a member cannot grab the slot while a guest holds it', () => {
  assert.deepEqual(claimDecision({ active: null, who: 'g:abc', now: NOW }), { ok: true });
  assert.equal(claimDecision({ active: guest, who: 'u:111', now: NOW }).ok, false);
  assert.equal(claimDecision({ active: guest, who: 'u:111', now: NOW }).by, 'Guest Gina');
  assert.deepEqual(claimDecision({ active: guest, who: 'g:abc', now: NOW }), { ok: true }); // reload
});

test('when the recorder leaves (silent 45 s) anyone can continue', () => {
  const gone = { ...guest, heartbeatAt: NOW - RECORDER_STALE_MS - 5 };
  assert.deepEqual(claimDecision({ active: gone, who: 'u:111', now: NOW }), { ok: true, takeover: true });
});

test('only the slot holder uploads', () => {
  assert.equal(uploadDecision({ active: guest, who: 'g:abc', isOrganizer: false, now: NOW }).ok, true);
  assert.equal(uploadDecision({ active: guest, who: 'g:other', isOrganizer: false, now: NOW }).ok, false);
  assert.equal(uploadDecision({ active: guest, who: 'u:org', isOrganizer: true, now: NOW }).ok, false);
});

test('recordingView: indicator and recorder from each person\'s point of view', () => {
  const rec = (active, extra = {}) => ({ segmentCount: 1, status: 'recording', activeRecorder: active, ...extra });
  const mine = recordingView({ recording: rec(guest), who: 'g:abc', now: NOW });
  assert.equal(mine.recording, true);
  assert.equal(mine.recorder.mine, true);
  const theirs = recordingView({ recording: rec(guest), who: 'u:111', now: NOW });
  assert.equal(theirs.recorder.mine, false);
  assert.equal(theirs.recorder.name, 'Guest Gina');
  // recorder vanished: nobody is recording any more, but the slot is shown stale so "Continue recording" can appear
  const gone = recordingView({ recording: rec({ ...guest, heartbeatAt: NOW - RECORDER_STALE_MS - 1 }), who: 'u:111', now: NOW });
  assert.equal(gone.recording, false);
  assert.equal(gone.recorder.stale, true);
  // released slot, new flow: not recording even though chunks exist
  assert.equal(recordingView({ recording: rec(undefined), who: 'u:111', now: NOW }).recording, false);
  // old single-recorder flow still shows its indicator
  assert.equal(recordingView({ recording: { status: 'recording', segmentCount: 0 }, who: 'u:111', now: NOW }).recording, true);
  // paused recorder keeps the slot and says so
  const paused = recordingView({ recording: rec({ ...guest, paused: true }), who: 'u:111', now: NOW });
  assert.equal(paused.recorder.paused, true);
});

const RECORDER_STALE = RECORDER_STALE_MS; // eslint-disable-line no-unused-vars
