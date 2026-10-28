import test from 'node:test';
import assert from 'node:assert/strict';
import { pairKey, cleanText, idGte, messageStatus, searchTerm, relationOf, createFlood, escapeRegex } from '../src/utils/connectLogic.js';

test('pairKey is the same in both directions', () => {
  assert.equal(pairKey('b', 'a'), pairKey('a', 'b'));
  assert.notEqual(pairKey('a', 'b'), pairKey('a', 'c'));
});

test('cleanText strips control characters, keeps line breaks, caps length', () => {
  assert.equal(cleanText('  hi\u0000 there\r\n\n\n\n\nbye  '), 'hi there\n\n\nbye');
  assert.equal(cleanText('x'.repeat(5000)).length, 4000);
  assert.equal(cleanText(null), '');
  assert.equal(cleanText('<b>x</b>'), '<b>x</b>'); // stored as text; the UI never renders it as HTML
});

test('message ticks follow the other person receipts', () => {
  const m = '650000000000000000000005';
  assert.equal(messageStatus(m, { readUpTo: '650000000000000000000009', deliveredUpTo: '650000000000000000000009' }), 'read');
  assert.equal(messageStatus(m, { readUpTo: '650000000000000000000001', deliveredUpTo: '650000000000000000000005' }), 'delivered');
  assert.equal(messageStatus(m, { readUpTo: null, deliveredUpTo: null }), 'sent');
  assert.equal(messageStatus(m, undefined), 'sent');
  assert.equal(idGte(undefined, m), false);
});

test('search terms', () => {
  assert.equal(searchTerm('a'), null);
  assert.deepEqual(searchTerm(' Ann  Lee '), { kind: 'name', value: 'Ann Lee' });
  assert.deepEqual(searchTerm('Bob@Example.com'), { kind: 'email', value: 'bob@example.com' });
  assert.equal(escapeRegex('a.*b'), 'a\\.\\*b');
});

test('relation to another user', () => {
  assert.equal(relationOf(null, 'me'), 'none');
  assert.equal(relationOf({ status: 'accepted' }, 'me'), 'friend');
  assert.equal(relationOf({ status: 'pending', requesterId: 'me' }, 'me'), 'outgoing');
  assert.equal(relationOf({ status: 'pending', requesterId: 'x' }, 'me'), 'incoming');
});

test('flood guard', () => {
  let t = 0;
  const ok = createFlood(2, 1000, () => t);
  assert.ok(ok('u')); assert.ok(ok('u')); assert.equal(ok('u'), false);
  t = 1500; assert.ok(ok('u'));
});

import { statusAmong, minId, previewOf, cleanGroupName } from '../src/utils/connectLogic.js';
import { inspectFile, safeName, extOf } from '../src/utils/fileSniff.js';

test('group ticks need every other member', () => {
  const m = '650000000000000000000005';
  const a = { readUpTo: '650000000000000000000009', deliveredUpTo: '650000000000000000000009' };
  const b = { readUpTo: '650000000000000000000001', deliveredUpTo: '650000000000000000000006' };
  assert.equal(statusAmong(m, [a, a]), 'read');
  assert.equal(statusAmong(m, [a, b]), 'delivered');
  assert.equal(statusAmong(m, [a, { readUpTo: null, deliveredUpTo: null }]), 'sent');
  assert.equal(statusAmong(m, []), 'sent');
  assert.equal(minId(['b', 'a']), 'a');
  assert.equal(minId(['a', null]), null);
});

test('previews and group names', () => {
  assert.equal(previewOf({ kind: 'image' }), '📷 Photo');
  assert.equal(previewOf({ kind: 'file', attachment: { name: 'plan.pdf' } }), '📄 plan.pdf');
  assert.equal(previewOf({ kind: 'text', text: 'hi', deletedAt: new Date() }), 'Message deleted');
  assert.equal(cleanGroupName('  Study\ngroup  '), 'Study group');
});

test('file checks accept real files and refuse fakes', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  assert.equal(inspectFile('pic.PNG', png).kind, 'image');
  assert.ok(inspectFile('pic.jpg', png).error, 'a PNG renamed .jpg is refused');
  assert.ok(inspectFile('run.exe', Buffer.from('MZ')).error);
  assert.ok(inspectFile('x.svg', Buffer.from('<svg onload=alert(1)>')).error);
  assert.ok(inspectFile('page.html', Buffer.from('<script>')).error);
  assert.equal(inspectFile('a.pdf', Buffer.from('%PDF-1.7')).inline, true);
  assert.equal(inspectFile('a.docx', Buffer.from([0x50, 0x4b, 0x03, 0x04, 1])).inline, false);
  assert.ok(inspectFile('a.txt', Buffer.from([65, 0, 66])).error, 'binary data is not text');
  assert.ok(inspectFile('a.pdf', Buffer.alloc(0)).error);
  assert.equal(safeName('..\\..\\evil/../a"b<c>.pdf'), 'abc.pdf');
  assert.equal(extOf('x.tar.GZ'), 'gz');
});

test('previewOf labels shared LifeOS items', () => {
  assert.equal(previewOf({ kind: 'resource', resource: { type: 'task', title: 'Finish essay' } }), '✅ Finish essay');
  assert.equal(previewOf({ kind: 'resource', resource: { type: 'meeting', title: 'Sync' } }), '🎥 Sync');
  assert.equal(previewOf({ kind: 'resource', deletedAt: new Date(), resource: { type: 'task', title: 'x' } }), 'Message deleted');
});

import { callLogText, durationText, shouldEnd, allDeclined, isRingExpired, RING_MS } from '../src/utils/callLogic.js';

test('call log lines', () => {
  const s = new Date('2026-01-01T10:00:00Z');
  assert.equal(callLogText({ mode: 'voice', reason: 'completed', startedAt: s, endedAt: new Date(s.getTime() + 212000) }), 'Voice call · 3 min 32 sec');
  assert.equal(callLogText({ mode: 'video', reason: 'completed', startedAt: s, endedAt: new Date(s.getTime() + 45000) }), 'Video call · 45 sec');
  assert.equal(callLogText({ mode: 'voice', reason: 'declined' }), 'Voice call declined');
  assert.equal(callLogText({ mode: 'video', reason: 'missed' }), 'Missed video call');
  assert.equal(callLogText({ mode: 'voice', reason: 'cancelled' }), 'Missed voice call');
  assert.equal(callLogText({ mode: 'voice', reason: 'completed' }), 'Missed voice call', 'completed with nobody answering is a missed call');
  assert.equal(durationText(3725000), '1 h 2 min');
});

test('when a call ends', () => {
  assert.equal(shouldEnd({ status: 'ringing', joined: 1, callerJoined: false }), true, 'caller hung up while ringing');
  assert.equal(shouldEnd({ status: 'ringing', joined: 1, callerJoined: true }), false);
  assert.equal(shouldEnd({ status: 'active', joined: 1, callerJoined: true }), true, 'only one person left');
  assert.equal(shouldEnd({ status: 'active', joined: 3, callerJoined: false }), false, 'group call goes on without the caller');
  assert.equal(shouldEnd({ status: 'ended', joined: 0, callerJoined: false }), false);
  assert.equal(allDeclined(['a', 'b'], ['a']), false);
  assert.equal(allDeclined(['a', 'b'], ['b', 'a']), true);
  assert.equal(allDeclined([], []), false);
  assert.equal(isRingExpired(new Date(Date.now() - RING_MS - 1000)), true);
  assert.equal(isRingExpired(new Date(Date.now() - 5000)), false);
});

import { applyReaction, REACTIONS } from '../src/utils/connectLogic.js';

test('reactions: one per person, same again removes, unknown ignored', () => {
  let l = applyReaction([], 'a', '👍');
  assert.deepEqual(l.map((r) => r.emoji), ['👍']);
  l = applyReaction(l, 'b', '👍');
  assert.equal(l.length, 2);
  l = applyReaction(l, 'a', '❤️'); // a changes their mind
  assert.equal(l.filter((r) => r.userId === 'a').length, 1);
  assert.equal(l.find((r) => r.userId === 'a').emoji, '❤️');
  l = applyReaction(l, 'a', '❤️'); // same again removes
  assert.equal(l.some((r) => r.userId === 'a'), false);
  assert.equal(applyReaction(l, 'c', '💣').length, l.length, 'unknown emoji is ignored');
  assert.equal(applyReaction(l, 'b', null).some((r) => r.userId === 'b'), false);
  assert.equal(REACTIONS.length, 6);
});

test('voice notes: webm/ogg/mp4 recordings are stored as audio; other types are refused', () => {
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
  assert.equal(inspectFile('x.webm', webm).kind, 'video', 'a normal .webm upload is still a video');
  const v = inspectFile('voice-note.webm', webm, { voice: true });
  assert.equal(v.kind, 'audio');
  assert.equal(v.mime, 'audio/webm');
  assert.ok(inspectFile('voice-note.exe', webm, { voice: true }).error);
  assert.ok(inspectFile('voice-note.pdf', Buffer.from('%PDF-1.4'), { voice: true }).error, 'voice flag cannot smuggle a document');
  assert.ok(inspectFile('a.webm', Buffer.from('<html>'), { voice: true }).error, 'the first bytes must still match a real recording');
});
