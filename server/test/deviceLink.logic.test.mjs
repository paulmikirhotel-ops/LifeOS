import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  QR_TTL_MS, APPROVED_CLAIM_MS, MAX_SESSIONS, newPairCode, normalizePair, describeDevice, maskIp, qrState, secondsLeft,
  statusSchema, targetSchema, pairSchema,
} from '../src/utils/deviceLink.logic.js';

test('pair codes look like XXXX-XXXX and never use 0, 1, O, I or L', () => {
  for (let i = 0; i < 300; i += 1) {
    const c = newPairCode();
    assert.match(c, /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    assert.ok(!/[01OIL]/.test(c));
  }
  assert.notEqual(newPairCode(), newPairCode());
});

test('normalizePair accepts lower case, spaces and a missing dash, and rejects anything else', () => {
  assert.equal(normalizePair('k7m2-9qxf'), 'K7M2-9QXF');
  assert.equal(normalizePair(' k7m2 9qxf '), 'K7M2-9QXF');
  assert.equal(normalizePair('K7M29QXF'), 'K7M2-9QXF');
  assert.equal(normalizePair('K7M2-9QX'), null);
  assert.equal(normalizePair('K7M2-9QXFF'), null);
  assert.equal(normalizePair('K7M2-9QX0'), null); // 0 is not used
  assert.equal(normalizePair(''), null);
  assert.equal(normalizePair(undefined), null);
});

test('describeDevice names the browser and the system', () => {
  const chromeWin = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
  const edge = `${chromeWin} Edg/130.0`;
  const firefoxLinux = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
  const safariIphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const androidApp = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 LifeOSApp/1.0';
  const androidChrome = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
  assert.deepEqual(describeDevice(chromeWin), { label: 'Chrome on Windows', kind: 'web' });
  assert.equal(describeDevice(edge).label, 'Edge on Windows');
  assert.equal(describeDevice(firefoxLinux).label, 'Firefox on Linux');
  assert.equal(describeDevice(safariIphone).label, 'Safari on iOS');
  assert.deepEqual(describeDevice(androidApp), { label: 'LifeOS app on Android', kind: 'app' });
  assert.equal(describeDevice(androidChrome).label, 'Chrome on Android');
  assert.deepEqual(describeDevice(''), { label: 'Browser', kind: 'web' });
  assert.deepEqual(describeDevice(undefined), { label: 'Browser', kind: 'web' });
});

test('maskIp hides the end of an address', () => {
  assert.equal(maskIp('102.89.34.17'), '102.89.34.•');
  assert.equal(maskIp('::ffff:102.89.34.17'), '102.89.34.•');
  assert.equal(maskIp('2001:db8:85a3::8a2e:370:7334'), '2001:db8:…');
  assert.equal(maskIp(''), '');
  assert.equal(maskIp(undefined), '');
  assert.equal(maskIp('not an ip'), '');
});

test('qrState: pending, then expired after 2 minutes; approved can be collected for 30 seconds', () => {
  const t0 = new Date('2026-10-29T10:00:00Z');
  const expiresAt = new Date(t0.getTime() + QR_TTL_MS);
  assert.equal(qrState({ status: 'pending', expiresAt }, t0), 'pending');
  assert.equal(qrState({ status: 'pending', expiresAt }, new Date(expiresAt.getTime() - 1)), 'pending');
  assert.equal(qrState({ status: 'pending', expiresAt }, expiresAt), 'expired');
  const approvedAt = new Date(t0.getTime() + 60_000);
  assert.equal(qrState({ status: 'approved', expiresAt, approvedAt }, new Date(approvedAt.getTime() + 2000)), 'approved');
  assert.equal(qrState({ status: 'approved', expiresAt, approvedAt }, new Date(approvedAt.getTime() + APPROVED_CLAIM_MS + 1)), 'expired');
  assert.equal(qrState({ status: 'denied', expiresAt }, t0), 'denied');
  assert.equal(qrState({ status: 'used', expiresAt }, t0), 'used');
  assert.equal(qrState(null, t0), 'expired');
  assert.equal(secondsLeft(expiresAt, t0), 120);
  assert.equal(secondsLeft(expiresAt, new Date(expiresAt.getTime() + 5000)), 0);
  assert.ok(MAX_SESSIONS >= 5);
});

const HEX = 'a'.repeat(48);
test('request shapes: codes are 48 hex characters; approve needs a code OR a ref, never both', () => {
  assert.ok(statusSchema.safeParse({ code: HEX, secret: HEX }).success);
  assert.ok(!statusSchema.safeParse({ code: HEX }).success);
  assert.ok(!statusSchema.safeParse({ code: 'short', secret: HEX }).success);
  assert.ok(targetSchema.safeParse({ code: HEX }).success);
  assert.ok(targetSchema.safeParse({ ref: 'b'.repeat(24) }).success);
  assert.ok(!targetSchema.safeParse({}).success);
  assert.ok(!targetSchema.safeParse({ code: HEX, ref: 'b'.repeat(24) }).success);
  assert.ok(!targetSchema.safeParse({ ref: 'xyz' }).success);
  assert.ok(pairSchema.safeParse({ pair: 'K7M2-9QXF' }).success);
  assert.ok(!pairSchema.safeParse({ pair: 'K7' }).success);
});
