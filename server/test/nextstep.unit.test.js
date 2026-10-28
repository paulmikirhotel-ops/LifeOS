/**
 * NextStep: pure logic and model shape (no database, no network).
 *   node --test test/nextstep.unit.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

const L = await import('../src/utils/nextstep.logic.js');
const { NextStepPlan } = await import('../src/models/nextstep.model.js');

const NOW = new Date('2026-10-13T10:00:00Z');
const DAY = 86400000;

const sample = () => ({
  title: '  Become a junior developer  ',
  summary: 'Six months, steady pace.',
  phases: [
    {
      title: 'Foundations',
      weeksLabel: 'Weeks 1 to 6',
      items: [
        { title: 'Finish HTML basics', kind: 'task', priority: 'high', estimatedMinutes: 90, weekOffset: 0 },
        { title: 'Weekly study session', kind: 'event', priority: 'medium', estimatedMinutes: 60, weekOffset: 1 },
      ],
    },
    { title: 'Projects', weeksLabel: 'Weeks 7 to 16', items: [{ title: 'Build a to-do app', weekOffset: 8 }] },
  ],
});

test('normalizeDraft computes real dates and starts everything as an unapproved draft', () => {
  const d = L.normalizeDraft(sample(), { now: NOW });
  assert.equal(d.title, 'Become a junior developer');
  assert.equal(d.phases.length, 2);
  const [a, b] = d.phases[0].items;
  assert.equal(a.state, 'draft');
  assert.equal(a.approved, false);
  assert.equal(a.dueDate.getTime(), NOW.getTime() + 1 * DAY);
  assert.equal(b.kind, 'event');
  assert.equal(b.startAt.getUTCHours(), 9);
  assert.equal(b.durationMinutes, 60);
  assert.equal(d.phases[1].items[0].priority, 'medium'); // default
  assert.equal(d.phases[1].items[0].estimatedMinutes, 45); // default
});

test('normalizeDraft clamps hostile or sloppy AI values', () => {
  const raw = {
    title: 'x'.repeat(500),
    summary: 'y'.repeat(2000),
    phases: [
      {
        title: 'P',
        items: [
          { title: 'a'.repeat(500), kind: 'EVENT', priority: 'nuclear', estimatedMinutes: 99999, weekOffset: 9999 },
          { title: 'b', estimatedMinutes: 'abc', weekOffset: -5 },
        ],
      },
    ],
  };
  const d = L.normalizeDraft(raw, { now: NOW });
  assert.equal(d.title.length, 120);
  assert.equal(d.summary.length, 400);
  const [x, y] = d.phases[0].items;
  assert.equal(x.title.length, 140);
  assert.equal(x.priority, 'medium');
  assert.equal(x.estimatedMinutes, 600);
  assert.equal(x.kind, 'event');
  assert.equal(x.durationMinutes, 240);
  assert.equal(x.dueDate.getTime(), NOW.getTime() + (L.LIMITS.maxWeek * 7 + 1) * DAY);
  assert.equal(y.estimatedMinutes, 45);
  assert.ok(y.dueDate.getTime() > NOW.getTime());
});

test('normalizeDraft caps phases, steps per phase and total steps', () => {
  const phases = Array.from({ length: 10 }, (_, p) => ({
    title: `P${p}`,
    items: Array.from({ length: 20 }, (_, i) => ({ title: `s${p}-${i}` })),
  }));
  const d = L.normalizeDraft({ title: 't', phases }, { now: NOW });
  assert.ok(d.phases.length <= L.LIMITS.phases);
  assert.ok(d.phases.every((p) => p.items.length <= L.LIMITS.itemsPerPhase));
  assert.ok(d.phases.reduce((n, p) => n + p.items.length, 0) <= L.LIMITS.items);
});

test('normalizeDraft never schedules past the target date', () => {
  const target = new Date(NOW.getTime() + 10 * DAY);
  const d = L.normalizeDraft({ title: 't', phases: [{ title: 'P', items: [{ title: 'late', weekOffset: 40 }] }] }, { now: NOW, targetDate: target });
  assert.ok(d.phases[0].items[0].dueDate.getTime() <= target.getTime());
});

test('normalizeDraft rejects an empty or malformed reply', () => {
  assert.throws(() => L.normalizeDraft({ title: 't', phases: [] }, { now: NOW }));
  assert.throws(() => L.normalizeDraft({ phases: [{ title: 'p', items: [{ title: 'a' }] }] }, { now: NOW }));
  assert.throws(() => L.normalizeDraft({ title: 't', phases: [{ title: 'p', items: [{ title: '   ' }] }] }, { now: NOW }));
});

const planWith = (states, extra = {}) => ({
  skipStreak: 0,
  phases: [
    {
      title: 'A',
      items: states.map((s, i) => ({ title: `i${i}`, state: s, dueDate: new Date(NOW.getTime() + (states.length - i) * DAY), ...(s === 'done' ? { completedAt: new Date(NOW.getTime() - DAY) } : {}) })),
    },
  ],
  ...extra,
});

test('progress counts done over live steps and ignores skipped ones', () => {
  assert.equal(L.progressOf(planWith(['done', 'created', 'draft', 'skipped'])), 33);
  assert.equal(L.progressOf(planWith(['skipped'])), 0);
  assert.equal(L.progressOf({ phases: [] }), 0);
  assert.equal(L.progressOf(planWith(['done', 'done'])), 100);
});

test('next action is the earliest-due scheduled step and never an unapproved draft', () => {
  const p = planWith(['created', 'created', 'draft']); // due: i0 = +3d, i1 = +2d, i2 = +1d
  const next = L.pickNextAction(p);
  assert.equal(next.item.title, 'i1');
  assert.equal(L.pickNextAction(planWith(['draft', 'done', 'skipped'])), null);
  assert.equal(L.pickNextAction({ phases: [] }), null);
});

test('week summary counts only recent completions', () => {
  const p = planWith(['done', 'created']);
  p.phases[0].items[0].completedAt = new Date(NOW.getTime() - 2 * DAY);
  assert.deepEqual(L.weekSummary(p, NOW), { done: 1, open: 1 });
  p.phases[0].items[0].completedAt = new Date(NOW.getTime() - 20 * DAY);
  assert.deepEqual(L.weekSummary(p, NOW), { done: 0, open: 1 });
});

test('lighter plan is offered after 3 skipped days', () => {
  assert.equal(L.shouldOfferLighter({ skipStreak: 2 }), false);
  assert.equal(L.shouldOfferLighter({ skipStreak: 3 }), true);
});

test('"not today" moves a step at least a day past now, never into the past', () => {
  const past = new Date(NOW.getTime() - 5 * DAY);
  assert.equal(L.pushOneDay(past, NOW).getTime(), NOW.getTime() + DAY);
  const future = new Date(NOW.getTime() + 3 * DAY);
  assert.equal(L.pushOneDay(future, NOW).getTime(), future.getTime() + DAY);
});

test('revision keeps scheduled and finished steps and drops drafts', () => {
  const p = planWith(['done', 'created', 'draft', 'draft']);
  const kept = L.keepLockedPhases(p);
  assert.equal(kept.length, 1);
  assert.deepEqual(kept[0].items.map((i) => i.title), ['i0', 'i1']);
  assert.deepEqual(L.lockedTitles(p), ['i0 [done]', 'i1 [created]']);
  assert.deepEqual(L.keepLockedPhases(planWith(['draft'])), []);
});

test('daily allowance: default 5, clamped 1..50, UTC day key', () => {
  assert.equal(L.dailyLimit(undefined), 5);
  assert.equal(L.dailyLimit('abc'), 5);
  assert.equal(L.dailyLimit('0'), 1);
  assert.equal(L.dailyLimit('9999'), 50);
  assert.equal(L.dailyLimit('8'), 8);
  assert.equal(L.dayKey(new Date('2026-10-13T23:59:59Z')), '2026-10-13');
  assert.equal(L.dayKey(new Date('2026-10-14T00:00:00Z')), '2026-10-14');
});

test('model: plan validates, items get ids, bad enums are rejected', () => {
  const ok = new NextStepPlan({
    tenantId: '65a000000000000000000001',
    userId: '65a000000000000000000002',
    goalText: 'Learn to code',
    title: 'Learn to code',
    phases: [{ title: 'P', items: [{ title: 'Step' }] }],
  });
  assert.equal(ok.validateSync(), undefined);
  assert.ok(ok.phases[0].items[0]._id);
  assert.equal(ok.phases[0].items[0].state, 'draft');
  assert.equal(ok.phases[0].items[0].approved, false);
  assert.equal(ok.status, 'draft');

  const bad = new NextStepPlan({
    tenantId: '65a000000000000000000001',
    userId: '65a000000000000000000002',
    goalText: 'g',
    title: 't',
    phases: [{ title: 'P', items: [{ title: 'Step', state: 'hacked' }] }],
  });
  assert.ok(bad.validateSync());
  assert.ok(new NextStepPlan({}).validateSync().errors.tenantId);
});
