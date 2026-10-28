import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { scrub } from '../src/services/account.service.js';

test('scrub strips secret-looking fields and stringifies ids', () => {
  const id = new mongoose.Types.ObjectId();
  const out = scrub({ _id: id, title: 'x', passwordHash: 'a', refreshTokenHash: 'b', nested: [{ apiSecret: 's', ok: 1 }], when: new Date(0) });
  assert.equal(out._id, id.toHexString());
  assert.equal(out.passwordHash, undefined);
  assert.equal(out.refreshTokenHash, undefined);
  assert.deepEqual(out.nested, [{ ok: 1 }]);
  assert.ok(out.when instanceof Date);
});

test('token cut-off rule: older tokens rejected, newer accepted', () => {
  const cutoff = new Date('2026-10-12T10:00:00.500Z');
  const rejected = (iat) => iat < Math.floor(cutoff.getTime() / 1000);
  assert.equal(rejected(Math.floor(Date.parse('2026-10-12T09:59:59Z') / 1000)), true);
  assert.equal(rejected(Math.floor(Date.parse('2026-10-12T10:00:01Z') / 1000)), false);
});

test('user model and routes load with the new fields', async () => {
  const { User } = await import('../src/models/index.js');
  for (const f of ['tokenValidAfter', 'pendingEmail', 'pendingEmailTokenHash', 'pendingEmailExpiresAt']) assert.ok(User.schema.path(f), f);
  const { createApp } = await import('../src/app.js');
  createApp();
});
