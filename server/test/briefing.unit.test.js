import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickTopPriorities,
  weekRange,
  weekRangeFromString,
  previousWeek,
  pctChange,
  buildWeeklyInsights,
  tomorrowFor,
  greetingFor,
  ymd,
} from '../src/services/briefingLogic.js';

const NOW = new Date(2026, 9, 8, 10, 0); // Thu 8 Oct 2026, 10:00 local
const at = (d, h = 12) => new Date(2026, 9, d, h, 0);

test('pickTopPriorities: overdue, then due today, then priority; ignores finished tasks', () => {
  const tasks = [
    { _id: 'a', title: 'later urgent', priority: 'urgent', status: 'not_started', dueDate: at(20) },
    { _id: 'b', title: 'today low', priority: 'low', status: 'not_started', dueDate: at(8) },
    { _id: 'c', title: 'overdue medium', priority: 'medium', status: 'in_progress', dueDate: at(5) },
    { _id: 'd', title: 'done', priority: 'urgent', status: 'completed', dueDate: at(1) },
    { _id: 'e', title: 'today high', priority: 'high', status: 'not_started', dueDate: at(8, 15) },
    { _id: 'f', title: 'no date', priority: 'urgent', status: 'not_started' },
  ];
  const top = pickTopPriorities(tasks, NOW, 3);
  assert.deepEqual(top.map((t) => t._id), ['c', 'e', 'b']);
  assert.deepEqual(top.map((t) => t.urgency), ['overdue', 'today', 'today']);
});

test('pickTopPriorities: handles empty input and tasks without due dates last', () => {
  assert.deepEqual(pickTopPriorities([], NOW), []);
  assert.deepEqual(pickTopPriorities(undefined, NOW), []);
  const top = pickTopPriorities([{ _id: 'x', status: 'not_started', priority: 'low' }], NOW);
  assert.equal(top[0].urgency, 'none');
});

test('weekRange: Monday to Sunday, end is exclusive', () => {
  const r = weekRange(NOW); // Thursday
  assert.equal(r.startStr, '2026-10-05');
  assert.equal(r.endStr, '2026-10-11');
  assert.equal(ymd(r.end), '2026-10-12');
  assert.equal(weekRange(new Date(2026, 9, 11, 23, 59)).startStr, '2026-10-05'); // Sunday belongs to the same week
  assert.equal(weekRange(new Date(2026, 9, 12, 0, 1)).startStr, '2026-10-12'); // next Monday starts a new week
});

test('previousWeek and weekRangeFromString', () => {
  assert.equal(previousWeek(weekRange(NOW)).startStr, '2026-09-28');
  assert.equal(weekRangeFromString('2026-10-09').startStr, '2026-10-05');
  assert.equal(weekRangeFromString('nope'), null);
  assert.equal(weekRangeFromString('2026-13-45'), null);
  assert.equal(weekRangeFromString(undefined), null);
});

test('pctChange', () => {
  assert.equal(pctChange(15, 10), 50);
  assert.equal(pctChange(5, 10), -50);
  assert.equal(pctChange(5, 0), null);
});

test('buildWeeklyInsights: compares with last week and stays within 4 lines', () => {
  const cur = { tasksCompleted: 12, tasksMissed: 3, habitCheckins: 9, habitSlots: 14, focusMinutes: 195, focusSessions: 6, spend: 150 };
  const prev = { tasksCompleted: 10, tasksMissed: 1, habitCheckins: 7, habitSlots: 14, spend: 100 };
  const out = buildWeeklyInsights(cur, prev);
  assert.ok(out.length <= 4);
  assert.match(out[0], /completed 12 tasks, up 20% on last week/);
  assert.match(out[1], /3 tasks were due and not finished/);
  assert.ok(out.some((l) => /Habit consistency was 64% \(up from 50%\)/.test(l)));
});

test('buildWeeklyInsights: quiet week and singular wording', () => {
  assert.deepEqual(buildWeeklyInsights({}, null), ['No tasks were due or completed this week.']);
  const one = buildWeeklyInsights({ tasksCompleted: 1, tasksMissed: 1 }, null);
  assert.match(one[0], /completed 1 task\./);
  assert.match(one[1], /1 task was due/);
  assert.deepEqual(buildWeeklyInsights(null, null), []);
});

test('tomorrowFor keeps the time of day, defaults to 09:00', () => {
  const t = tomorrowFor({ dueDate: new Date(2026, 9, 8, 15, 30) }, NOW);
  assert.equal(t.getDate(), 9);
  assert.equal(t.getHours(), 15);
  assert.equal(t.getMinutes(), 30);
  const d = tomorrowFor({}, NOW);
  assert.equal(d.getDate(), 9);
  assert.equal(d.getHours(), 9);
});

test('greetingFor', () => {
  assert.equal(greetingFor(8), 'Good morning');
  assert.equal(greetingFor(13), 'Good afternoon');
  assert.equal(greetingFor(20), 'Good evening');
});
