import test from 'node:test';
import assert from 'node:assert/strict';
import { productivityScore, focusMinutesOf } from '../src/services/scoring.service.js';
import { nextDueDate, addPeriod, buildNextOccurrence, isRecurring } from '../src/services/recurrence.js';
import { escapeRegex } from '../src/utils/escapeRegex.js';

test('focusMinutesOf: excludes pauses and handles unfinished sessions', () => {
  const startedAt = new Date('2026-01-01T10:00:00Z');
  const endedAt = new Date('2026-01-01T10:30:00Z');
  assert.equal(focusMinutesOf({ startedAt, endedAt, pausedMs: 5 * 60000 }), 25);
  assert.equal(focusMinutesOf({ startedAt, endedAt }), 30);
  assert.equal(focusMinutesOf({ startedAt }), 0);
  assert.equal(focusMinutesOf(null), 0);
});

test('productivityScore: no data gives 0 and hasData=false', () => {
  const r = productivityScore({});
  assert.equal(r.score, 0);
  assert.equal(r.hasData, false);
});

test('productivityScore: tasks only are not penalised for missing focus or habits', () => {
  const r = productivityScore({ completed: 3, missed: 1 });
  assert.equal(r.score, 75);
  assert.equal(r.breakdown.taskRate, 0.75);
});

test('productivityScore: all three components use 50/30/20 weights', () => {
  // tasks 100%, focus 50% of 7h/week target (210 of 420 min), habits 50% (7 of 14 slots)
  const r = productivityScore({ completed: 2, missed: 0, focusMinutes: 210, habitCheckins: 7, activeHabits: 2, days: 7 });
  assert.equal(r.score, Math.round(100 * (0.5 * 1 + 0.3 * 0.5 + 0.2 * 0.5)));
});

test('productivityScore: ratios are capped at 100%', () => {
  const r = productivityScore({ completed: 1, missed: 0, focusMinutes: 9999, habitCheckins: 99, activeHabits: 1, days: 7 });
  assert.equal(r.score, 100);
});

test('addPeriod: daily, weekly, monthly with month-end clamping', () => {
  assert.equal(addPeriod(new Date(2026, 0, 31, 9), 'daily').getDate(), 1);
  assert.equal(addPeriod(new Date(2026, 0, 1), 'weekly').getDate(), 8);
  const m = addPeriod(new Date(2026, 0, 31, 9), 'monthly'); // Jan 31 -> Feb 28 (2026 is not a leap year)
  assert.equal(m.getMonth(), 1);
  assert.equal(m.getDate(), 28);
  assert.equal(m.getHours(), 9);
  assert.throws(() => addPeriod(new Date(), 'none'));
});

test('nextDueDate: always in the future, even when completed late', () => {
  const completedAt = new Date(2026, 5, 10, 12);
  const due = new Date(2026, 5, 1, 9); // 9 days late
  const next = nextDueDate(due, 'daily', completedAt);
  assert.ok(next > completedAt);
  assert.equal(next.getDate(), 11);
  assert.equal(next.getHours(), 9);
});

test('nextDueDate: task without a due date is scheduled one period after completion', () => {
  const completedAt = new Date(2026, 5, 10, 12);
  assert.equal(nextDueDate(null, 'weekly', completedAt).getDate(), 17);
});

test('buildNextOccurrence: resets status and subtasks, keeps the rest', () => {
  const completedAt = new Date(2026, 5, 10, 12);
  const next = buildNextOccurrence(
    {
      tenantId: 't1',
      createdBy: 'u1',
      title: 'Water plants',
      priority: 'low',
      recurrenceType: 'daily',
      status: 'completed',
      dueDate: new Date(2026, 5, 10, 9),
      subtasks: [{ title: 'Kitchen', isDone: true }],
    },
    completedAt
  );
  assert.equal(next.status, 'not_started');
  assert.equal(next.title, 'Water plants');
  assert.deepEqual(next.subtasks, [{ title: 'Kitchen', isDone: false }]);
  assert.equal(next.dueDate.getDate(), 11);
  assert.equal('completedAt' in next, false);
});

test('isRecurring', () => {
  assert.equal(isRecurring('daily'), true);
  assert.equal(isRecurring('none'), false);
  assert.equal(isRecurring(undefined), false);
});

test('escapeRegex: user text becomes a literal pattern', () => {
  const evil = '(a+)+$';
  const rx = new RegExp(escapeRegex(evil), 'i');
  assert.ok(rx.test('xx(a+)+$yy'));
  assert.equal(rx.test('aaaaaaaaaaaaaaaaaaaaaaaa!'), false);
  assert.equal(escapeRegex('a.b*c'), 'a\\.b\\*c');
  assert.equal(escapeRegex(undefined), '');
});

test('resendWaitMs: one verification email per minute', async () => {
  const { resendWaitMs } = await import('../src/services/auth.service.js');
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();
  assert.equal(resendWaitMs(undefined, now), 0); // never sent
  assert.equal(resendWaitMs(new Date(now - 120_000 + DAY), now), 0); // sent 2 minutes ago
  const wait = resendWaitMs(new Date(now - 20_000 + DAY), now); // sent 20 seconds ago
  assert.ok(wait > 39_000 && wait <= 40_000);
});

import { actionStatusForTask, actionPatchForTaskPatch } from '../src/services/actionItemSync.js';

test('actionStatusForTask maps task statuses to action item statuses', () => {
  assert.equal(actionStatusForTask('completed'), 'completed');
  assert.equal(actionStatusForTask('in_progress'), 'in_progress');
  assert.equal(actionStatusForTask('not_started'), 'pending');
  assert.equal(actionStatusForTask('postponed'), 'pending');
  assert.equal(actionStatusForTask('cancelled'), 'cancelled');
  assert.equal(actionStatusForTask('weird'), null);
});

test('actionPatchForTaskPatch only carries relevant fields', () => {
  assert.equal(actionPatchForTaskPatch({ title: 'x' }), null);
  assert.deepEqual(actionPatchForTaskPatch({ status: 'completed', title: 'x' }), { status: 'completed' });
  assert.deepEqual(actionPatchForTaskPatch({ dueDate: null }), { deadline: null });
  assert.deepEqual(actionPatchForTaskPatch({ priority: 'high' }), { priority: 'high' });
});
