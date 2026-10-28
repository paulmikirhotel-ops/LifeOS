/** Minutes access — pure logic. node --test test/minutes.unit.test.js */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { cleanEmail, signMinutesKey, verifyMinutesKey, dedupeRecipients, buildMinutesEmail } = await import('../src/utils/minutesAccess.js');

test('cleanEmail accepts good, rejects bad', () => {
  assert.equal(cleanEmail('  Mary@Example.COM '), 'mary@example.com');
  for (const bad of ['', 'nope', 'a@b', 'a b@c.com', '<x>@y.com', null]) assert.equal(cleanEmail(bad), '');
});

test('minutes key: round trip, tamper and wrong shape rejected', () => {
  const id = 'a'.repeat(24);
  const key = signMinutesKey(id, 'Mary@Example.com');
  assert.deepEqual(verifyMinutesKey(key), { meetingId: id, who: 'mary@example.com' });
  const [body, mac] = key.split('.');
  assert.equal(verifyMinutesKey(`${body}.${mac.slice(0, -1)}x`), null);
  const other = Buffer.from(`${'b'.repeat(24)}|mary@example.com`).toString('base64url');
  assert.equal(verifyMinutesKey(`${other}.${mac}`), null); // key for one meeting can't be re-pointed at another
  for (const bad of ['', 'abc', 'a.b.c', undefined]) assert.equal(verifyMinutesKey(bad), null);
});

test('recipients: de-duplicated, organizer and invalid skipped', () => {
  const out = dedupeRecipients(
    [{ email: 'A@x.com', name: 'A' }, { email: 'a@x.com', name: 'A again' }, { email: 'boss@x.com', name: 'Boss' }, { email: 'bad', name: 'B' }, { name: 'none' }],
    ['BOSS@x.com']
  );
  assert.deepEqual(out, [{ email: 'a@x.com', name: 'A' }]);
});

test('email escapes html and carries the link', () => {
  const m = buildMinutesEmail({ title: 'Q3 <b>plan</b>', organizerName: 'Sam', startAt: '2026-10-09T10:00:00Z', name: 'Eve', url: 'https://x.test/minutes/k' });
  assert.match(m.subject, /Q3/);
  assert.ok(!m.html.includes('<b>plan'));
  assert.ok(m.text.includes('https://x.test/minutes/k') && m.html.includes('https://x.test/minutes/k'));
});
