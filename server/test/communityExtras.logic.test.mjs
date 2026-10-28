import test from 'node:test';
import assert from 'node:assert/strict';
import * as X from '../src/utils/communityExtras.logic.js';

const NOW = new Date('2026-11-02T10:00:00Z');
const at = (min) => new Date(NOW.getTime() + min * 60000).toISOString();

test('resource links: only normal public http(s) addresses', () => {
  assert.deepEqual(X.cleanResourceUrl('https://www.youtube.com/watch?v=abc#t=5'), { ok: true, url: 'https://www.youtube.com/watch?v=abc', domain: 'youtube.com' });
  assert.equal(X.cleanResourceUrl('example.org/guide').url, 'https://example.org/guide', 'a missing https:// is added');
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.org/x', 'https://user:pw@example.org', 'http://localhost/x', 'http://127.0.0.1/x', 'http://192.168.1.5/x', 'https://intranet', 'https://printer.local/x', 'not a link', '']) {
    assert.equal(X.cleanResourceUrl(bad).ok, false, bad);
  }
  assert.equal(X.cleanResourceUrl(`https://example.org/${'a'.repeat(400)}`).ok, false);
});

test('resource form: title, link and one skill are needed; note is optional', () => {
  assert.ok(X.resourceSchema.safeParse({ title: 'Pivot tables', url: 'https://example.org', skill: 'excel' }).success);
  assert.equal(X.resourceSchema.parse({ title: 'Pivot tables', url: 'https://example.org', skill: 'excel' }).note, '');
  assert.ok(!X.resourceSchema.safeParse({ title: 'ab', url: 'https://example.org', skill: 'excel' }).success);
  assert.ok(!X.resourceSchema.safeParse({ title: 'Pivot tables', url: 'https://example.org' }).success);
});

test('three different reporters hide a resource, two do not', () => {
  assert.equal(X.shouldHideResource(2), false);
  assert.equal(X.shouldHideResource(3), true);
});

test('session times: 15 to 90 minutes in steps of 5, at least 10 minutes ahead, within 60 days', () => {
  assert.equal(X.validateSlot(at(60), 30, NOW).ok, true);
  assert.equal(X.validateSlot(at(60), 30, NOW).endsAt.toISOString(), at(90));
  assert.match(X.validateSlot(at(60), 10, NOW).reason, /15 to 90 minutes/);
  assert.match(X.validateSlot(at(60), 95, NOW).reason, /15 to 90 minutes/);
  assert.match(X.validateSlot(at(60), 32, NOW).reason, /steps of 5/);
  assert.match(X.validateSlot(at(5), 30, NOW).reason, /at least 10 minutes/);
  assert.match(X.validateSlot(at(-60), 30, NOW).reason, /at least 10 minutes/);
  assert.match(X.validateSlot(at(61 * 24 * 60), 30, NOW).reason, /60 days/);
  assert.match(X.validateSlot('nonsense', 30, NOW).reason, /date and time/);
});

test('overlap: touching ends do not overlap, real overlap does', () => {
  const a = { startsAt: at(60), endsAt: at(90) };
  assert.equal(X.overlaps(a, { startsAt: at(90), endsAt: at(120) }), false);
  assert.equal(X.overlaps(a, { startsAt: at(80), endsAt: at(120) }), true);
  assert.equal(X.overlaps(a, { startsAt: at(0), endsAt: at(61) }), true);
});

test('state shown to each person', () => {
  const s = { proposerId: 'A', otherId: 'B', startsAt: at(60), endsAt: at(90), status: 'proposed' };
  assert.equal(X.stateOf(s, 'A', NOW), 'waiting_them');
  assert.equal(X.stateOf(s, 'B', NOW), 'waiting_you');
  assert.equal(X.stateOf({ ...s, startsAt: at(-5) }, 'B', NOW), 'expired');
  assert.equal(X.stateOf({ ...s, status: 'accepted' }, 'B', NOW), 'accepted');
  assert.equal(X.stateOf({ ...s, status: 'accepted', startsAt: at(-60), endsAt: at(-30) }, 'B', NOW), 'done');
  assert.equal(X.stateOf({ ...s, status: 'declined' }, 'B', NOW), 'declined');
});

test('reminders: only accepted, not yet sent, starting within 30 minutes', () => {
  const s = { status: 'accepted', reminderSent: false, startsAt: at(20) };
  assert.equal(X.reminderDue(s, NOW), true);
  assert.equal(X.reminderDue({ ...s, startsAt: at(45) }, NOW), false);
  assert.equal(X.reminderDue({ ...s, reminderSent: true }, NOW), false);
  assert.equal(X.reminderDue({ ...s, status: 'cancelled' }, NOW), false);
  assert.equal(X.reminderDue({ ...s, startsAt: at(-1) }, NOW), false);
});

test('forms: propose needs a person, a time and minutes; respond is accept or decline', () => {
  const ok = { userId: 'a'.repeat(24), startsAt: at(60), minutes: 30 };
  assert.ok(X.proposeSchema.safeParse(ok).success);
  assert.equal(X.proposeSchema.parse(ok).note, '');
  assert.ok(!X.proposeSchema.safeParse({ ...ok, minutes: 5 }).success);
  assert.ok(!X.proposeSchema.safeParse({ ...ok, startsAt: 'tomorrow' }).success);
  assert.ok(X.respondSchema.safeParse({ action: 'accept' }).success);
  assert.ok(!X.respondSchema.safeParse({ action: 'maybe' }).success);
});
