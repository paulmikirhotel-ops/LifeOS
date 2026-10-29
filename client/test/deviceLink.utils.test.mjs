import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLinkCode, cleanPairInput, formatPairTyping, clock, agoText, isUnverified, isExpiredLink } from '../src/utils/deviceLink.js';

const HEX = 'ab12'.repeat(12);
test('parseLinkCode reads a LifeOS link or a bare code, and nothing else', () => {
  assert.equal(parseLinkCode(`https://lifepilot-os.netlify.app/link/${HEX}`), HEX);
  assert.equal(parseLinkCode(`https://x.test/link/${HEX.toUpperCase()}?a=1`), HEX);
  assert.equal(parseLinkCode(`  ${HEX} `), HEX);
  assert.equal(parseLinkCode('https://x.test/link/short'), null);
  assert.equal(parseLinkCode('https://x.test/other/' + HEX), null);
  assert.equal(parseLinkCode('hello'), null);
  assert.equal(parseLinkCode(''), null);
  assert.equal(parseLinkCode(undefined), null);
  assert.equal(parseLinkCode(HEX + 'ab'), null);
});
test('pair code typing', () => {
  assert.equal(formatPairTyping('k7m29qxf'), 'K7M2-9QXF');
  assert.equal(formatPairTyping('k7'), 'K7');
  assert.equal(formatPairTyping('k7m2-9qxf-zzzz'), 'K7M2-9QXF');
  assert.equal(cleanPairInput('k7m2 9qxf'), 'K7M2-9QXF');
  assert.equal(cleanPairInput('K7M2-9QX'), null);
  assert.equal(cleanPairInput('K7M2-9QX0'), null);
  assert.equal(cleanPairInput(null), null);
});
test('clock and ago', () => {
  assert.equal(clock(95), '1:35');
  assert.equal(clock(7), '0:07');
  assert.equal(clock(-3), '0:00');
  assert.equal(clock('x'), '0:00');
  const now = Date.parse('2026-10-29T12:00:00Z');
  assert.equal(agoText('2026-10-29T11:59:50Z', now), 'just now');
  assert.equal(agoText('2026-10-29T11:55:00Z', now), '5 minutes ago');
  assert.equal(agoText('2026-10-29T11:00:00Z', now), '1 hour ago');
  assert.equal(agoText('2026-10-26T12:00:00Z', now), '3 days ago');
  assert.equal(agoText('nope', now), '');
});
test('error helpers', () => {
  assert.equal(isUnverified({ response: { data: { code: 'EMAIL_NOT_VERIFIED' } } }), true);
  assert.equal(isUnverified({ response: { data: { error: { code: 'EMAIL_NOT_VERIFIED' } } } }), true);
  assert.equal(isUnverified({ response: { data: {} } }), false);
  assert.equal(isUnverified(null), false);
  assert.equal(isExpiredLink({ response: { status: 410 } }), true);
  assert.equal(isExpiredLink({ response: { status: 500, data: {} } }), false);
});
