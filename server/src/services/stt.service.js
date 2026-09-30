import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Speech-to-text behind a small provider interface. Keys are read from the server
 * environment only. Currently implemented: Deepgram (pre-recorded API — accepts either a
 * URL, which keeps a 2-hour file off our small API server, or raw audio bytes for short
 * live chunks). Adding another provider = one more branch in transcribeUrl/transcribeBuffer.
 *
 * Speaker labels are DIARIZATION labels ("Speaker 1"), not verified identities.
 */

export function sttConfigured() {
  return env.stt.provider === 'deepgram' && Boolean(env.stt.apiKey);
}

function requireStt() {
  if (!sttConfigured()) {
    throw new ApiError(503, 'Speech-to-text is not configured on the server', { code: 'STT_NOT_CONFIGURED' });
  }
}

function listenUrl({ diarize }) {
  const p = new URLSearchParams({
    model: env.stt.model,
    punctuate: 'true',
    smart_format: 'true',
    utterances: 'true',
    diarize: String(Boolean(diarize)),
  });
  if (env.stt.language && env.stt.language !== 'auto') p.set('language', env.stt.language);
  return `https://api.deepgram.com/v1/listen?${p}`;
}

/** Maps a Deepgram response to transcript segments (no seq assigned here). */
export function parseDeepgram(json, { offsetMs = 0, diarize = false } = {}) {
  const utterances = json?.results?.utterances;
  if (Array.isArray(utterances) && utterances.length) {
    return utterances
      .filter((u) => u.transcript && u.transcript.trim())
      .map((u) => ({
        text: u.transcript.trim().slice(0, 5000),
        startMs: offsetMs + Math.round((u.start || 0) * 1000),
        endMs: offsetMs + Math.round((u.end || 0) * 1000),
        confidence: typeof u.confidence === 'number' ? Math.min(1, Math.max(0, u.confidence)) : undefined,
        speakerLabel: diarize && Number.isInteger(u.speaker) ? `Speaker ${u.speaker + 1}` : 'Speaker',
      }));
  }
  const alt = json?.results?.channels?.[0]?.alternatives?.[0];
  if (alt?.transcript?.trim()) {
    return [
      {
        text: alt.transcript.trim().slice(0, 5000),
        startMs: offsetMs,
        confidence: alt.confidence,
        speakerLabel: 'Speaker',
      },
    ];
  }
  return [];
}

async function call(url, init, timeoutMs) {
  let res;
  try {
    res = await fetch(url, {
      ...init,
      headers: { Authorization: `Token ${env.stt.apiKey}`, ...init.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new Error(`Speech-to-text request failed: ${err.name === 'TimeoutError' ? 'timed out' : err.message}`);
  }
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 300);
    const err = new Error(`Speech-to-text provider returned ${res.status}${body ? `: ${body}` : ''}`);
    // Bad key / bad request will not fix itself on retry (429 and 5xx will).
    err.permanent = res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408;
    throw err;
  }
  return res.json();
}

/** Full-recording pass (diarized) from a fetchable URL. */
export async function transcribeUrl(audioUrl, { diarize = true } = {}) {
  requireStt();
  const json = await call(
    listenUrl({ diarize }),
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: audioUrl }) },
    15 * 60 * 1000
  );
  return parseDeepgram(json, { diarize });
}

/** Short audio clip (live chunk) from bytes. */
export async function transcribeBuffer(buffer, mimeType = 'audio/webm', { offsetMs = 0, diarize = false } = {}) {
  requireStt();
  const json = await call(
    listenUrl({ diarize }),
    { method: 'POST', headers: { 'Content-Type': mimeType.split(';')[0] }, body: buffer },
    60 * 1000
  );
  return parseDeepgram(json, { offsetMs, diarize });
}
