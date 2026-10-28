import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanEmail, dedupeRecipients } from '../src/utils/minutesAccess.js';

test('extra e-mails are cleaned and deduped, organizer excluded', () => {
  const r = dedupeRecipients([{ email: 'A@x.com' }, { email: 'a@x.com' }, { email: 'bad' }, { email: 'org@x.com' }], ['org@x.com']);
  assert.deepEqual(r.map((x) => x.email), ['a@x.com']);
  assert.equal(cleanEmail(' Z@Y.io '), 'z@y.io');
  assert.equal(cleanEmail('nope'), '');
});
