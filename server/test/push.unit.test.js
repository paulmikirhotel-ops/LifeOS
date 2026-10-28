import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, deliver } from '../src/services/push.service.js';

test('sanitize keeps links on this site and trims text', () => {
  assert.equal(sanitize({ url: 'https://evil.com' }).url, '/');
  assert.equal(sanitize({ url: '//evil.com' }).url, '/');
  assert.equal(sanitize({ url: '/connect' }).url, '/connect');
  assert.equal(sanitize({ title: 'x'.repeat(500), body: 'y'.repeat(500) }).title.length, 100);
  assert.equal(sanitize({ body: 'y'.repeat(500) }).body.length, 140);
  assert.equal(sanitize({}).title, 'LifeOS');
});

test('deliver sends to every device, drops gone ones, never throws', async () => {
  const subs = [
    { _id: 1, endpoint: 'https://a', p256dh: 'k', auth: 'a' },
    { _id: 2, endpoint: 'https://gone', p256dh: 'k', auth: 'a' },
    { _id: 3, endpoint: 'https://broken', p256dh: 'k', auth: 'a' },
  ];
  const calls = [];
  const wp = {
    async sendNotification(sub, body, opts) {
      calls.push({ sub, body: JSON.parse(body), opts });
      if (sub.endpoint === 'https://gone') throw Object.assign(new Error('gone'), { statusCode: 410 });
      if (sub.endpoint === 'https://broken') throw new Error('network');
    },
  };
  const gone = [];
  const sent = await deliver(subs, { title: 'Hi', urgent: true }, wp, async (s) => gone.push(s._id));
  assert.equal(sent, 1);
  assert.deepEqual(gone, [2]);
  assert.equal(calls[0].opts.urgency, 'high');
  assert.equal(calls[0].opts.TTL, 45);
});
