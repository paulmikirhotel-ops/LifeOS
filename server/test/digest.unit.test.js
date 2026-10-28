import test from 'node:test';
import assert from 'node:assert/strict';
import {
  unsubscribeToken,
  verifyUnsubscribeToken,
  digestRows,
  isEmptyWeek,
  buildDigest,
  digestWindowOpen,
} from '../src/services/digestEmail.js';

const SECRET = 'test-secret';
const ID = 'a'.repeat(24);

test('unsubscribe token verifies only for the right user, token and secret', () => {
  const t = unsubscribeToken(ID, SECRET);
  assert.equal(verifyUnsubscribeToken(ID, t, SECRET), true);
  assert.equal(verifyUnsubscribeToken('b'.repeat(24), t, SECRET), false);
  assert.equal(verifyUnsubscribeToken(ID, t, 'other'), false);
  assert.equal(verifyUnsubscribeToken(ID, 'short', SECRET), false);
  assert.equal(verifyUnsubscribeToken(ID, undefined, SECRET), false);
});

test('digestRows leaves out sections with no data', () => {
  assert.deepEqual(digestRows({}), []);
  const rows = digestRows({ tasksCompleted: 5, tasksMissed: 2, focusMinutes: 150, habitSlots: 10, habitCheckins: 7, meetingsHeld: 1 });
  assert.deepEqual(rows, [
    ['Tasks completed', '5'],
    ['Due and not finished', '2'],
    ['Focus time', '2.5 h'],
    ['Habit consistency', '70%'],
    ['Meetings held', '1'],
  ]);
});

test('isEmptyWeek', () => {
  assert.equal(isEmptyWeek(null), true);
  assert.equal(isEmptyWeek({ stats: {}, score: 0 }), true);
  assert.equal(isEmptyWeek({ stats: { tasksCompleted: 1 }, score: 100 }), false);
});

test('buildDigest escapes user text and includes both links', () => {
  const m = buildDigest({
    name: '<b>Amara</b> Okafor',
    week: { start: '2026-09-28', end: '2026-10-04' },
    score: 72,
    stats: { tasksCompleted: 3 },
    insights: ['You did <script>alert(1)</script>'],
    aiText: null,
    todayUrl: 'https://app.example/today',
    unsubscribeUrl: 'https://api.example/api/briefing/unsubscribe?u=1&t=2',
  });
  assert.equal(m.subject, 'Your LifeOS week: 72/100');
  assert.ok(!m.html.includes('<script>'));
  assert.ok(!m.html.includes('<b>Amara'));
  assert.ok(m.html.includes('&lt;script&gt;'));
  assert.ok(m.html.includes('https://app.example/today'));
  assert.ok(m.text.includes('Stop these emails: https://api.example/api/briefing/unsubscribe?u=1&t=2'));
  assert.ok(m.html.includes('unsubscribe?u=1&amp;t=2'));
});

test('digestWindowOpen: closed only on Monday before 07:00', () => {
  assert.equal(digestWindowOpen(new Date(2026, 9, 5, 3, 0)), false); // Mon 5 Oct 03:00
  assert.equal(digestWindowOpen(new Date(2026, 9, 5, 7, 0)), true);
  assert.equal(digestWindowOpen(new Date(2026, 9, 6, 3, 0)), true); // Tuesday
});
