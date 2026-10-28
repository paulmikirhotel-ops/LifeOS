import test from 'node:test';
import assert from 'node:assert/strict';
import { ymdLocal, dayBefore, streakAtRisk, pileMessage, inStreakWindow, inPileWindow } from '../src/services/automationLogic.js';

test('dayBefore crosses month and year boundaries', () => {
  assert.equal(dayBefore('2026-10-01'), '2026-09-30');
  assert.equal(dayBefore('2026-01-01'), '2025-12-31');
  assert.equal(dayBefore('2024-03-01'), '2024-02-29');
});

test('streakAtRisk counts the run ending yesterday', () => {
  const today = '2026-10-08';
  assert.equal(streakAtRisk(['2026-10-07', '2026-10-06', '2026-10-05'], today), 3);
  assert.equal(streakAtRisk(['2026-10-07', '2026-10-05', '2026-10-04'], today), 1); // gap on the 6th
  assert.equal(streakAtRisk(['2026-10-06', '2026-10-05'], today), 0); // yesterday missed
  assert.equal(streakAtRisk(['2026-10-08', '2026-10-07', '2026-10-06'], today), 0); // already done today
  assert.equal(streakAtRisk([], today), 0);
  assert.equal(streakAtRisk(['2026-10-07', '2026-10-07', '2026-10-06'], today), 2); // duplicates ignored
});

test('pileMessage', () => {
  const now = new Date(2026, 9, 8, 12);
  assert.ok(pileMessage(7, new Date(2026, 9, 1, 12), now).includes('7 overdue tasks, the oldest 7 days late'));
  assert.ok(pileMessage(5, new Date(2026, 9, 7, 6), now).includes('the oldest 1 day late'));
  assert.ok(!pileMessage(5, now, now).includes('oldest'));
});

test('time windows', () => {
  assert.equal(inStreakWindow(new Date(2026, 9, 8, 17, 59)), false);
  assert.equal(inStreakWindow(new Date(2026, 9, 8, 18, 0)), true);
  assert.equal(inStreakWindow(new Date(2026, 9, 8, 22, 0)), false);
  assert.equal(inPileWindow(new Date(2026, 9, 8, 8, 59)), false);
  assert.equal(inPileWindow(new Date(2026, 9, 8, 9, 0)), true);
  assert.equal(ymdLocal(new Date(2026, 9, 8)), '2026-10-08');
});
