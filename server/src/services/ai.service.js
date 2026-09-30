import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * LLM access behind a provider-agnostic interface. The provider, key, model and base URL
 * come from server environment variables only — nothing here is ever sent to the browser.
 *
 *   AI_PROVIDER=anthropic   → Anthropic Messages API
 *   AI_PROVIDER=openai      → any OpenAI-compatible /chat/completions API (set AI_BASE_URL)
 */

const DEFAULT_MODELS = { anthropic: 'claude-haiku-4-5-20251001' };

export function aiConfigured() {
  const a = env.ai;
  if (!a.apiKey) return false;
  if (a.provider === 'anthropic') return true;
  if (a.provider === 'openai') return Boolean(a.model);
  return false;
}

function requireAi() {
  if (!aiConfigured()) {
    throw new ApiError(503, 'AI provider is not configured on the server', { code: 'AI_NOT_CONFIGURED' });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(url, headers, body) {
  const delays = [1000, 4000, 12000];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      if (res.ok) return await res.json();
      const text = (await res.text().catch(() => '')).slice(0, 300);
      const err = new Error(`AI provider returned ${res.status}${text ? `: ${text}` : ''}`);
      const retryable = res.status === 429 || res.status >= 500;
      err.permanent = !retryable;
      if (!retryable) throw err;
      lastErr = err;
      const ra = parseInt(res.headers.get('retry-after') || '', 10);
      if (attempt < delays.length) await sleep(Number.isFinite(ra) ? Math.min(ra, 20) * 1000 : delays[attempt]);
    } catch (err) {
      if (err.permanent) throw err;
      lastErr = err;
      if (attempt < delays.length) await sleep(delays[attempt]);
    }
  }
  throw new Error(`AI request failed: ${lastErr?.message || 'unknown error'}`);
}

/** Returns plain text from the configured model. */
export async function generateText({ system, prompt, maxTokens = 2000, temperature = 0.2 }) {
  requireAi();
  const a = env.ai;
  if (a.provider === 'anthropic') {
    const json = await post(
      `${a.baseUrl || 'https://api.anthropic.com'}/v1/messages`,
      { 'x-api-key': a.apiKey, 'anthropic-version': '2023-06-01' },
      {
        model: a.model || DEFAULT_MODELS.anthropic,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: 'user', content: prompt }],
      }
    );
    return (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  }
  const json = await post(
    `${(a.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`,
    { Authorization: `Bearer ${a.apiKey}` },
    {
      model: a.model,
      temperature,
      [a.maxTokensParam]: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }
  );
  return json.choices?.[0]?.message?.content || '';
}

/** Pulls the first JSON object out of a model reply (tolerates code fences / preamble). */
export function extractJson(text) {
  const cleaned = String(text).replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object found in model reply');
  return JSON.parse(cleaned.slice(start, end + 1));
}

/**
 * Generates JSON validated by a zod schema. One repair attempt is made with the exact
 * validation error before the call is reported as failed.
 */
export async function generateJson({ system, prompt, schema, maxTokens = 3000 }) {
  const jsonSystem = `${system}\n\nReturn ONLY a single valid JSON object. No prose, no markdown fences.`;
  let reply = await generateText({ system: jsonSystem, prompt, maxTokens, temperature: 0 });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const parsed = schema.safeParse(extractJson(reply));
      if (parsed.success) return parsed.data;
      throw new Error(parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    } catch (err) {
      if (attempt === 1) throw new Error(`AI returned invalid structured output (${err.message})`);
      reply = await generateText({
        system: jsonSystem,
        prompt: `${prompt}\n\nYour previous reply was invalid: ${err.message}\nReturn the corrected JSON object only.`,
        maxTokens,
        temperature: 0,
      });
    }
  }
  throw new Error('unreachable');
}
