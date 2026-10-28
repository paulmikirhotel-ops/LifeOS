import test from 'node:test';
import assert from 'node:assert/strict';
import { goalProgress, goalHealth, idleDays, latestDate, consistency } from '../src/services/goalLogic.js';

const NOW = new Date(2026, 9, 8, 12, 0);
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000);

test('goalProgress: milestones and tasks count equally', () => {
  const r = goalProgress({
    milestones: [{ isDone: true }, { isDone: false }],
    tasks: [{ status: 'completed' }, { status: 'in_progress' }],
  });
  assert.equal(r.progress, 50);
  assert.equal(r.done, 2);
  assert.equal(r.total, 4);
  assert.equal(r.auto, true);
});

test('goalProgress: cancelled tasks are ignored', () => {
  const r = goalProgress({ tasks: [{ status: 'completed' }, { status: 'cancelled' }] });
  assert.equal(r.progress, 100);
  assert.equal(r.total, 1);
});

test('goalProgress: keeps manual progress when nothing is linked', () => {
  const r = goalProgress({ manualProgress: 40 });
  assert.equal(r.progress, 40);
  assert.equal(r.auto, false);
  assert.equal(goalProgress({ manualProgress: 140 }).progress, 100);
});

test('goalHealth: done, cancelled, overdue, no_plan', () => {
  assert.equal(goalHealth({ goal: { status: 'completed' }, progress: 100, itemCount: 1, now: NOW }), 'done');
  assert.equal(goalHealth({ goal: { status: 'cancelled' }, progress: 0, itemCount: 1, now: NOW }), 'cancelled');
  assert.equal(goalHealth({ goal: { status: 'active', targetDate: daysAgo(1) }, progress: 50, itemCount: 2, now: NOW }), 'overdue');
  assert.equal(goalHealth({ goal: { status: 'active' }, progress: 0, itemCount: 0, now: NOW }), 'no_plan');
});

test('goalHealth: slipping when idle 7+ days or behind schedule', () => {
  const g = { status: 'active' };
  assert.equal(goalHealth({ goal: g, progress: 50, itemCount: 2, lastActivityAt: daysAgo(8), now: NOW }), 'slipping');
  assert.equal(goalHealth({ goal: g, progress: 50, itemCount: 2, lastActivityAt: daysAgo(2), now: NOW }), 'on_track');
  const timed = { status: 'active', createdAt: daysAgo(80), targetDate: new Date(NOW.getTime() + 20 * 86400000) };
  assert.equal(goalHealth({ goal: timed, progress: 20, itemCount: 2, lastActivityAt: daysAgo(1), now: NOW }), 'slipping');
  assert.equal(goalHealth({ goal: timed, progress: 70, itemCount: 2, lastActivityAt: daysAgo(1), now: NOW }), 'on_track');
});

test('idleDays, latestDate, consistency', () => {
  assert.equal(idleDays(null, NOW), null);
  assert.equal(idleDays(daysAgo(3), NOW), 3);
  assert.equal(latestDate([null, daysAgo(5), daysAgo(2)]).getTime(), daysAgo(2).getTime());
  assert.equal(latestDate([null]), null);
  assert.equal(consistency(['a', 'b', 'b'], 14), 14);
  assert.equal(consistency([], 14), 0);
});

import { neglectCheck, dayKey, IDLE_DAYS } from '../src/services/goalLogic.js';

test('neglectCheck: idle only when active, has items, not overdue, 7+ days quiet', () => {
  const g = { status: 'active', createdAt: daysAgo(30) };
  assert.equal(IDLE_DAYS, 7);
  assert.deepEqual(neglectCheck({ goal: g, itemCount: 2, lastActivityAt: daysAgo(9), now: NOW }), { idle: true, days: 9 });
  assert.equal(neglectCheck({ goal: g, itemCount: 2, lastActivityAt: daysAgo(6), now: NOW }).idle, false);
  assert.equal(neglectCheck({ goal: g, itemCount: 0, lastActivityAt: daysAgo(20), now: NOW }).idle, false);
  assert.equal(neglectCheck({ goal: { ...g, targetDate: daysAgo(1) }, itemCount: 2, lastActivityAt: daysAgo(20), now: NOW }).idle, false);
  assert.equal(neglectCheck({ goal: { ...g, status: 'completed' }, itemCount: 2, lastActivityAt: daysAgo(20), now: NOW }).idle, false);
});

test('neglectCheck: falls back to creation date when nothing was ever done', () => {
  const g = { status: 'active', createdAt: daysAgo(10) };
  assert.equal(neglectCheck({ goal: g, itemCount: 1, lastActivityAt: null, now: NOW }).days, 10);
  assert.equal(neglectCheck({ goal: { status: 'active', createdAt: daysAgo(2) }, itemCount: 1, lastActivityAt: null, now: NOW }).idle, false);
});

test('dayKey is local YYYY-MM-DD', () => {
  assert.equal(dayKey(new Date(2026, 9, 8, 23, 30)), '2026-10-08');
});
