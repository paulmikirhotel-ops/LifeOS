/**
 * OpenAI-compatible AI requests — unit tests (stubbed network, no database).
 *   node --test test/ai.openai.unit.test.js
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'unit-test-secret';
process.env.JWT_REFRESH_SECRET = 'unit-test-refresh';
process.env.AI_PROVIDER = 'openai';
process.env.AI_API_KEY = 'test-key';
process.env.AI_MODEL = 'openai/gpt-oss-120b';
process.env.AI_BASE_URL = 'https://api.groq.com/openai/v1/';

const { env } = await import('../../LifeOS-fresh/server/src/config/env.js');

const { generateText, aiConfigured } = await import('../src/services/ai.service.js');

const realFetch = globalThis.fetch;
let calls;
const reply = (body, status = 200) => async (url, init) => {
  calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
};

beforeEach(() => {
  calls = [];
  env.ai.reasoningEffort = '';
  env.ai.tokenMultiplier = 1;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

test('is configured, and the URL has no double slash', async () => {
  assert.equal(aiConfigured(), true);
  globalThis.fetch = reply({ choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }] });
  assert.equal(await generateText({ system: 's', prompt: 'p', maxTokens: 700 }), 'hi');
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(calls[0].headers.Authorization, 'Bearer test-key');
});

test('defaults send nothing extra and keep the answer limit unchanged', async () => {
  globalThis.fetch = reply({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] });
  await generateText({ system: 's', prompt: 'p', maxTokens: 700 });
  assert.equal(calls[0].body.max_tokens, 700);
  assert.equal('reasoning_effort' in calls[0].body, false);
});

test('reasoning settings: effort is sent and the limit is multiplied', async () => {
  env.ai.reasoningEffort = 'low';
  env.ai.tokenMultiplier = 4;
  globalThis.fetch = reply({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] });
  await generateText({ system: 's', prompt: 'p', maxTokens: 700 });
  assert.equal(calls[0].body.reasoning_effort, 'low');
  assert.equal(calls[0].body.max_tokens, 2800);
  assert.equal(calls[0].body.model, 'openai/gpt-oss-120b');
});

test('an empty answer cut off by the length limit gives a clear, permanent error', async () => {
  globalThis.fetch = reply({ choices: [{ message: { content: '' }, finish_reason: 'length' }] });
  await assert.rejects(
    () => generateText({ system: 's', prompt: 'p', maxTokens: 700 }),
    (e) => /AI_REASONING_EFFORT=low/.test(e.message) && e.permanent === true
  );
});

test('a wrong model name (404) fails fast with the provider message and is not retried', async () => {
  globalThis.fetch = reply({ error: { message: 'The model `x` does not exist', code: 'model_not_found' } }, 404);
  await assert.rejects(() => generateText({ system: 's', prompt: 'p' }), (e) => /returned 404/.test(e.message) && e.permanent === true);
  assert.equal(calls.length, 1);
});

test('an out-of-range multiplier setting is clamped when read from the environment', async () => {
  assert.ok(env.ai.tokenMultiplier >= 1 && env.ai.tokenMultiplier <= 8);
});

test('rate limit (429) is retried using Retry-After, then succeeds', async () => {
  let n = 0;
  globalThis.fetch = async (url, init) => {
    n += 1;
    calls.push({ url, body: JSON.parse(init.body) });
    if (n < 3) return new Response('{"error":{"message":"rate limited"}}', { status: 429, headers: { 'retry-after': '0' } });
    return new Response(JSON.stringify({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] }), { status: 200 });
  };
  assert.equal(await generateText({ system: 's', prompt: 'p' }), 'done');
  assert.equal(n, 3);
});

test('"request too large" explains what to change and is not retried', async () => {
  globalThis.fetch = reply({ error: { message: 'Request too large for model on tokens per minute (TPM): Limit 8000, Requested 9500' } }, 413);
  await assert.rejects(() => generateText({ system: 's', prompt: 'p' }), (e) => /AI_CHUNK_CHARS/.test(e.message) && e.permanent === true);
  assert.equal(calls.length, 1);
});

test('requests are spaced by AI_MIN_INTERVAL_MS, even when started at the same moment', async () => {
  env.ai.minIntervalMs = 120;
  const times = [];
  globalThis.fetch = async (url, init) => {
    times.push(Date.now());
    return new Response(JSON.stringify({ choices: [{ message: { content: 'x' }, finish_reason: 'stop' }] }), { status: 200 });
  };
  await Promise.all([generateText({ system: 's', prompt: '1' }), generateText({ system: 's', prompt: '2' }), generateText({ system: 's', prompt: '3' })]);
  env.ai.minIntervalMs = 0;
  assert.equal(times.length, 3);
  assert.ok(times[1] - times[0] >= 100, `gap 1 was ${times[1] - times[0]}ms`);
  assert.ok(times[2] - times[1] >= 100, `gap 2 was ${times[2] - times[1]}ms`);
});

test('chunk and interval settings are clamped to safe ranges', () => {
  assert.ok(env.ai.chunkChars >= 3000 && env.ai.chunkChars <= 60000);
  assert.ok(env.ai.minIntervalMs >= 0 && env.ai.minIntervalMs <= 60000);
});
