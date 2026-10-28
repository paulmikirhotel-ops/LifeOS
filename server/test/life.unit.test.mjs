import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/utils/life.logic.js';

test('dates: week starts Monday, validation, range', () => {
  assert.equal(L.weekStart('2026-10-15'), '2026-10-12'); // Thursday
  assert.equal(L.weekStart('2026-10-12'), '2026-10-12');
  assert.equal(L.weekStart('2026-10-18'), '2026-10-12'); // Sunday
  assert.equal(L.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(L.isDateStr('2026-02-30'), false);
  assert.equal(L.isDateStr('2026-2-3'), false);
  const now = new Date('2026-10-15T12:00:00Z');
  assert.equal(L.dateAllowed('2026-10-16', now), true);
  assert.equal(L.dateAllowed('2026-10-17', now), false);
  assert.equal(L.dateAllowed('2025-01-01', now), false);
});

test('tags and links are cleaned', () => {
  assert.deepEqual(L.cleanTags(['#Excel', 'excel', ' Big Data ', '', 'a'.repeat(50)]), ['excel', 'big-data', 'a'.repeat(30)]);
  assert.equal(L.cleanTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).length, 8);
  assert.equal(L.cleanUrl(''), '');
  assert.equal(L.cleanUrl('https://example.com/a b'), 'https://example.com/a%20b');
  assert.throws(() => L.cleanUrl('javascript:alert(1)'));
  assert.throws(() => L.cleanUrl('https://user:pw@example.com'));
  assert.throws(() => L.cleanUrl('nonsense'));
});

test('search: every word must match anywhere in title, body, tags or link', () => {
  const e = { title: 'Pivot tables', body: 'Group by month', tags: ['excel'], url: 'https://x.com/learn' };
  assert.equal(L.matchesTerms(e, L.queryTerms('pivot excel')), true);
  assert.equal(L.matchesTerms(e, L.queryTerms('pivot python')), false);
  assert.equal(L.matchesTerms(e, L.queryTerms('MONTH')), true);
  assert.deepEqual(L.queryTerms('  a b c d e f g '), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(L.termsToRegex(['a.b'])[0].test('axb'), false, 'regex characters are escaped');
});

test('schemas reject bad input', () => {
  assert.equal(L.logSchema.safeParse({ areaId: 'x', minutes: 30, date: '2026-10-15' }).success, false);
  assert.equal(L.logSchema.safeParse({ areaId: 'a'.repeat(24), minutes: 0, date: '2026-10-15' }).success, false);
  assert.equal(L.logSchema.safeParse({ areaId: 'a'.repeat(24), minutes: 1441, date: '2026-10-15' }).success, false);
  assert.equal(L.logSchema.safeParse({ areaId: 'a'.repeat(24), minutes: 30, date: '2026-13-15' }).success, false);
  assert.equal(L.logSchema.safeParse({ areaId: 'a'.repeat(24), minutes: 30, date: '2026-10-15' }).success, true);
  assert.equal(L.entrySchema.safeParse({ kind: 'poem', title: 't' }).success, false);
  assert.equal(L.entrySchema.safeParse({ kind: 'note', title: '' }).success, false);
  assert.equal(L.areaSchema.safeParse({ name: 'Health', targetMinutes: -5 }).success, false);
  assert.equal(L.entryPatchSchema.safeParse({}).success, false);
});

const areas = [{ _id: 'a1', name: 'Health', targetMinutes: 240 }, { _id: 'a2', name: 'Work', targetMinutes: 0 }];
test('week view, averages and gentle notes use only logged minutes', () => {
  const logs = [
    { areaId: 'a1', date: '2026-10-13', minutes: 60 }, { areaId: 'a1', date: '2026-10-14', minutes: 30 },
    { areaId: 'a1', date: '2026-10-06', minutes: 100 }, { areaId: 'a1', date: '2026-09-29', minutes: 50 }, { areaId: 'a1', date: '2026-09-22', minutes: 20 },
    { areaId: 'a2', date: '2026-10-13', minutes: 500 },
  ];
  const t = L.totalsByWeek(logs);
  const ws = '2026-10-12';
  const v = L.weekView(areas, t, ws);
  assert.deepEqual(v[0], { areaId: 'a1', name: 'Health', minutes: 90, auto: 0, manual: 90, target: 240, pct: 38 });
  assert.equal(v[1].pct, null, 'no target, no percentage');
  assert.equal(L.previousAverage('a1', t, ws), Math.round((100 + 50 + 20 + 0) / 4));
  assert.equal(L.streakBelow('a1', 240, t, ws), 3, 'weeks before the first log do not count');
  assert.equal(L.streakBelow('a2', 0, t, ws), 0);
  const notes = L.gentleNotes(areas, t, ws);
  assert.equal(notes.length, 1);
  assert.match(notes[0].text, /Health .* 3 weeks in a row/);
  assert.deepEqual(L.gentleNotes(areas, L.totalsByWeek(logs.filter((l) => l.date >= '2026-10-06')), ws), [], 'not enough history: say nothing');
});

const sections = {
  knowledge: [{ kind: 'lesson', title: 'Categories first', body: 'Start with categories', url: '', tags: ['excel'], pinned: false }],
  areas: [{ name: 'Health', targetMinutes: 240 }],
  balanceLogs: [{ areaName: 'Health', date: '2026-10-13', minutes: 60, note: '' }],
  radarSources: [{ name: 'Jobs', url: 'https://weworkremotely.com/x.rss', type: 'job' }],
  radarKeywords: ['react'],
  tasks: [{ title: 'Call supplier', status: 'completed', priority: 'high', category: 'Work', dueDate: '2026-10-10T00:00:00.000Z', subtasks: [], recurrenceType: 'none' }],
  goals: [{ title: 'Learn Excel', type: 'short_term', status: 'active', progress: 40, milestones: [{ title: 'Pivot tables', isDone: true }] }],
};

test('backup round trip: build, parse, checksum catches edits', () => {
  const b = L.buildBackup(sections, new Date('2026-10-15T00:00:00Z'));
  assert.equal(b.format, 1);
  const ok = L.parseBackup(JSON.stringify(b));
  assert.equal(ok.ok, true);
  assert.equal(ok.backup.sections.knowledge.length, 1);
  const bad = JSON.parse(JSON.stringify(b)); bad.sections.knowledge[0].title = 'Changed';
  assert.equal(L.parseBackup(JSON.stringify(bad)).ok, false);
  assert.equal(L.parseBackup('not json').ok, false);
  assert.equal(L.parseBackup(JSON.stringify({ app: 'Other' })).ok, false);
  assert.equal(L.parseBackup(JSON.stringify({ ...b, format: 2 })).ok, false);
});

const emptyExisting = () => ({ entrySigs: new Set(), areaNames: new Set(), logSigs: new Set(), sourceUrls: new Set(), taskSigs: new Set(), goalSigs: new Set(), keywords: [], entryCount: 0, areaCount: 0 });

test('restore adds everything into an empty account', () => {
  const p = L.planRestore(sections, emptyExisting());
  assert.deepEqual(L.planCounts(p), {
    knowledge: { add: 1, skip: 0, overLimit: 0 }, areas: { add: 1, skip: 0, overLimit: 0 }, balanceLogs: { add: 1, skip: 0, noArea: 0 },
    radarSources: { add: 1, skip: 0, rejected: 0, overLimit: 0 }, radarKeywords: { add: 1, skip: 0 },
    tasks: { add: 1, skip: 0, noPermission: 0 }, goals: { add: 1, skip: 0 },
  });
});

test('restoring twice skips what exists and never duplicates', () => {
  const first = L.planRestore(sections, emptyExisting());
  const existing = {
    entrySigs: new Set(first.knowledge.add.map(L.entrySig)), areaNames: new Set(['health']),
    logSigs: new Set(first.balanceLogs.add.map(L.logSig)), sourceUrls: new Set(['https://weworkremotely.com/x.rss']),
    taskSigs: new Set([L.taskSig(sections.tasks[0])]), goalSigs: new Set([L.goalSig(sections.goals[0])]),
    keywords: ['react'], entryCount: 1, areaCount: 1,
  };
  const p = L.planCounts(L.planRestore(sections, existing));
  assert.equal(p.knowledge.add, 0); assert.equal(p.knowledge.skip, 1);
  assert.equal(p.areas.add, 0); assert.equal(p.balanceLogs.add, 0); assert.equal(p.balanceLogs.skip, 1);
  assert.equal(p.radarSources.add, 0); assert.equal(p.radarKeywords.add, 0);
  assert.equal(p.tasks.add, 0); assert.equal(p.tasks.skip, 1); assert.equal(p.goals.add, 0); assert.equal(p.goals.skip, 1);
});

test('restore respects limits, drops unsafe links and feeds, and skips logs of unknown areas', () => {
  const many = { ...sections, knowledge: Array.from({ length: 5 }, (_, i) => ({ kind: 'note', title: `n${i}`, body: '', url: i === 0 ? 'javascript:alert(1)' : '', tags: [], pinned: false })) };
  const ex = { ...emptyExisting(), entryCount: L.LIMITS.entries - 2 };
  const p = L.planRestore(many, ex);
  assert.equal(p.knowledge.add.length, 2);
  assert.equal(p.knowledge.overLimit, 3);
  assert.equal(p.knowledge.add[0].url, '', 'a javascript: link is dropped, not saved');
  const p2 = L.planRestore({ ...sections, areas: [], balanceLogs: sections.balanceLogs }, emptyExisting());
  assert.equal(p2.balanceLogs.noArea, 1);
  const p3 = L.planRestore(sections, emptyExisting(), { cleanFeedUrl: () => '' });
  assert.equal(p3.radarSources.rejected, 1);
});

test('area schema: automatic sources are optional and a patch does not reset them', () => {
  const ok = L.areaSchema.safeParse({ name: 'Work', taskCategories: ['Work'], eventTypes: ['meeting', 'work'] });
  assert.equal(ok.success, true);
  assert.equal(L.areaSchema.safeParse({ name: 'Work', eventTypes: ['task'] }).success, false, 'task events are not selectable');
  const patch = L.areaPatchSchema.parse({ name: 'Job' });
  assert.deepEqual(patch, { name: 'Job' });
});

test('autoLogs: finished tasks and ended events go to the first matching area, once', () => {
  const ar = [{ _id: 'w', taskCategories: ['Work'], eventTypes: ['meeting'] }, { _id: 'h', taskCategories: ['work', 'Gym'], eventTypes: ['exercise', 'meeting'] }];
  const now = new Date('2026-10-15T12:00:00Z');
  const tasks = [
    { status: 'completed', completedAt: '2026-10-14T09:00:00Z', category: 'WORK', actualMinutes: 50, estimatedMinutes: 90 },
    { status: 'completed', completedAt: '2026-10-14T09:00:00Z', category: 'gym', estimatedMinutes: 45 },
    { status: 'completed', completedAt: '2026-10-14T09:00:00Z', category: 'gym' },
    { status: 'in_progress', completedAt: null, category: 'gym', actualMinutes: 30 },
    { status: 'completed', completedAt: '2026-10-14T09:00:00Z', category: 'other', actualMinutes: 30 },
    { status: 'completed', completedAt: '2026-10-14T09:00:00Z', actualMinutes: 30 },
  ];
  const events = [
    { type: 'meeting', startAt: '2026-10-13T10:00:00Z', endAt: '2026-10-13T11:00:00Z' },
    { type: 'exercise', startAt: '2026-10-13T17:00:00Z', endAt: '2026-10-13T17:30:00Z' },
    { type: 'meeting', startAt: '2026-10-16T10:00:00Z', endAt: '2026-10-16T11:00:00Z' },
    { type: 'meeting', allDay: true, startAt: '2026-10-13T00:00:00Z', endAt: '2026-10-14T00:00:00Z' },
    { type: 'task', startAt: '2026-10-13T10:00:00Z', endAt: '2026-10-13T11:00:00Z' },
  ];
  const { logs, noTime } = L.autoLogs(ar, tasks, events, now);
  const sum = (id) => logs.filter((l) => l.areaId === id).reduce((s, l) => s + l.minutes, 0);
  assert.equal(sum('w'), 50 + 60, 'task (actual wins over estimate) + the meeting; the work task is not also given to h');
  assert.equal(sum('h'), 45 + 30, 'gym task by estimate + exercise event');
  assert.deepEqual(noTime, { h: 1 }, 'a finished gym task with no minutes is reported, not guessed');
  assert.equal(logs.some((l) => l.date === '2026-10-16'), false, 'future events are not counted');
});

test('weekView separates manual and automatic minutes', () => {
  const ar = [{ _id: 'a1', name: 'Work', targetMinutes: 600 }];
  const manual = L.totalsByWeek([{ areaId: 'a1', date: '2026-10-13', minutes: 30 }]);
  const auto = L.totalsByWeek([{ areaId: 'a1', date: '2026-10-14', minutes: 90 }]);
  const v = L.weekView(ar, L.mergeTotals(manual, auto), '2026-10-12', auto);
  assert.deepEqual(v[0], { areaId: 'a1', name: 'Work', minutes: 120, auto: 90, manual: 30, target: 600, pct: 20 });
});

test('restore: no task permission means tasks are listed but not added; unknown old backups still parse', () => {
  const p = L.planRestore(sections, emptyExisting(), { canTasks: false });
  assert.equal(p.tasks.add.length, 0);
  assert.equal(p.tasks.noPermission, 1);
  const legacy = L.buildBackup({ knowledge: [], areas: [], balanceLogs: [], radarSources: [], radarKeywords: [] });
  const raw = JSON.parse(JSON.stringify(legacy)); delete raw.sections.tasks; delete raw.sections.goals;
  raw.checksum = L.sectionsChecksum(raw.sections);
  assert.equal(L.parseBackup(JSON.stringify(raw)).ok, true, 'a backup made before tasks and goals were added');
});

test('restore drops a bad task date and an invalid status', () => {
  assert.equal(L.backupSchema.safeParse({ app: 'LifeOS', format: 1, createdAt: 'x', checksum: 'a'.repeat(64), sections: { tasks: [{ title: 't', status: 'weird' }] } }).success, false);
});
