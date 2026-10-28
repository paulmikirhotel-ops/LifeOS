/** Meeting chat text rules. node --test test/chat.unit.test.js */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanMessage, CHAT_MAX } from '../src/utils/chatText.js';

test('trims, keeps normal text and line breaks', () => {
  assert.equal(cleanMessage('  hello team  '), 'hello team');
  assert.equal(cleanMessage('a\nb'), 'a\nb');
});

test('removes control characters and limits blank lines', () => {
  assert.equal(cleanMessage('he\u0000llo\u0007'), 'hello');
  assert.equal(cleanMessage('a\n\n\n\n\n\nb'), 'a\n\n\nb');
  assert.equal(cleanMessage('a\r\nb'), 'a\nb');
});

test('empty and non-string input become empty', () => {
  for (const v of ['', '   ', null, undefined, '\n\n']) assert.equal(cleanMessage(v), '');
  assert.equal(cleanMessage(1234), '1234');
});

test('caps the length and keeps HTML as plain text', () => {
  assert.equal(cleanMessage('x'.repeat(CHAT_MAX + 50)).length, CHAT_MAX);
  assert.equal(cleanMessage('<b>hi</b>'), '<b>hi</b>'); // rendered as text by the page, never as markup
});
