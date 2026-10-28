import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stampCall, nextIncoming, acceptIncomingEvent, INCOMING_GRACE_MS, CALL_CHECK_MS } from '../src/utils/callState.js';

const NOW = 1_700_000_000_000;
const call = (over = {}) => ({ id: 'c1', conversationId: 'v1', mode: 'voice', status: 'ringing', callerId: 'A', callerName: 'Ann', group: false, title: 'Ann', ringLeftMs: 40_000, ...over });

test('stampCall: ring time left comes from the server, so a phone clock that is wrong cannot hide the call', () => {
  // This phone's clock is an hour ahead of the server: ringingUntil looks like it is long past.
  const skewed = call({ ringLeftMs: 40_000, ringingUntil: new Date(NOW - 3_600_000).toISOString() });
  const s = stampCall(skewed, NOW);
  assert.equal(s.expiresAt, NOW + 40_000);
  assert.equal(s.shownAt, NOW);
});

test('stampCall: an older server without ringLeftMs still works (falls back to ringingUntil)', () => {
  const s = stampCall(call({ ringLeftMs: undefined, ringingUntil: new Date(NOW + 25_000).toISOString() }), NOW);
  assert.equal(s.expiresAt, NOW + 25_000);
});

test('stampCall: a call with no usable ring time never gets an expiry of NaN (which would hide it at once)', () => {
  const s = stampCall(call({ ringLeftMs: undefined, ringingUntil: undefined }), NOW);
  assert.ok(Number.isFinite(s.expiresAt));
  assert.ok(s.expiresAt > NOW);
  assert.equal(stampCall(null), null);
});

test('acceptIncomingEvent: a ringing call from someone else is shown, with a stamp', () => {
  const next = acceptIncomingEvent({ current: null, call: call(), dismissed: new Set(), myId: 'B', now: NOW });
  assert.equal(next.id, 'c1');
  assert.equal(next.expiresAt, NOW + 40_000);
});

test('acceptIncomingEvent: the same event delivered twice keeps ONE screen (same object, so no second ring)', () => {
  const first = acceptIncomingEvent({ current: null, call: call(), dismissed: new Set(), myId: 'B', now: NOW });
  const second = acceptIncomingEvent({ current: first, call: call(), dismissed: new Set(), myId: 'B', now: NOW + 500 });
  assert.equal(second, first);
});

test('acceptIncomingEvent: my own outgoing call, an ended call and a call I already dismissed are ignored', () => {
  assert.equal(acceptIncomingEvent({ current: null, call: call({ callerId: 'B' }), dismissed: new Set(), myId: 'B', now: NOW }), null);
  assert.equal(acceptIncomingEvent({ current: null, call: call({ status: 'ended' }), dismissed: new Set(), myId: 'B', now: NOW }), null);
  assert.equal(acceptIncomingEvent({ current: null, call: call(), dismissed: new Set(['c1']), myId: 'B', now: NOW }), null);
  assert.equal(acceptIncomingEvent({ current: null, call: undefined, dismissed: new Set(), myId: 'B', now: NOW }), null);
});

test('nextIncoming: the server says a call is ringing and nothing is on screen -> show it', () => {
  const n = nextIncoming({ current: null, fromServer: call(), dismissed: new Set(), now: NOW });
  assert.equal(n.id, 'c1');
});

test('nextIncoming: the same call again keeps the screen that is already up (no restart of the ring)', () => {
  const shown = stampCall(call(), NOW);
  assert.equal(nextIncoming({ current: shown, fromServer: call(), dismissed: new Set(), now: NOW + 3000 }), shown);
});

test('nextIncoming: a call I declined does not come back when a late answer from the server still lists it', () => {
  assert.equal(nextIncoming({ current: null, fromServer: call(), dismissed: new Set(['c1']), now: NOW }), null);
});

test('nextIncoming: "nothing ringing" from a check that is older than a fresh event does not wipe the screen', () => {
  const shown = stampCall(call(), NOW);
  assert.equal(nextIncoming({ current: shown, fromServer: null, dismissed: new Set(), now: NOW + 1000 }), shown);
});

test('nextIncoming: once the grace time has passed, "nothing ringing" clears a call that was cancelled or answered elsewhere', () => {
  const shown = stampCall(call(), NOW);
  assert.equal(nextIncoming({ current: shown, fromServer: null, dismissed: new Set(), now: NOW + INCOMING_GRACE_MS + 1 }), null);
});

test('nextIncoming: a different call ringing replaces the old one', () => {
  const shown = stampCall(call(), NOW);
  const n = nextIncoming({ current: shown, fromServer: call({ id: 'c2' }), dismissed: new Set(), now: NOW + 2000 });
  assert.equal(n.id, 'c2');
});

test('the safety-net check runs often enough to matter but not constantly', () => {
  assert.ok(CALL_CHECK_MS >= 3000 && CALL_CHECK_MS <= 15000);
});
