/**
 * Post-deploy smoke test for the Meetings module (Phase 14).
 * Talks to a RUNNING API over HTTP with a real account; creates a throw-away meeting and deletes it.
 *
 *   API_URL=https://your-api.onrender.com SMOKE_EMAIL=you@example.com SMOKE_PASSWORD='…' \
 *     node scripts/smoke-meetings.mjs [--audio]
 *
 * --audio also uploads two tiny fake audio chunks and waits for the recording to be finalised
 * (needs recording storage configured). Credentials come from the environment only.
 */
const API = (process.env.API_URL || '').replace(/\/$/, '');
const EMAIL = process.env.SMOKE_EMAIL;
const PASSWORD = process.env.SMOKE_PASSWORD;
const WITH_AUDIO = process.argv.includes('--audio');
if (!API || !EMAIL || !PASSWORD) {
  console.error('Set API_URL, SMOKE_EMAIL and SMOKE_PASSWORD.');
  process.exit(2);
}

let cookie = '';
let failed = 0;
const step = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failed += 1;
};
async function call(path, { method = 'GET', body, headers = {}, raw } = {}) {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: { ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const set = res.headers.getSetCookie?.() || [];
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json, res };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const t0 = Date.now();
const health = await call('/health');
step('API reachable (a sleeping free-tier server can take ~1 min to wake)', health.status === 200, `${Date.now() - t0} ms`);

const login = await call('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
step('login', login.status === 200, login.json?.message);
if (login.status !== 200) process.exit(1);

const caps = (await call('/meetings/capabilities')).json?.data || {};
console.log('     capabilities:', JSON.stringify(caps));

const start = new Date(Date.now() + 3600e3);
const created = await call('/meetings', {
  method: 'POST',
  body: { title: `Smoke test ${new Date().toISOString()}`, timezone: 'UTC', startAt: start.toISOString(), endAt: new Date(start.getTime() + 1800e3).toISOString(), participants: [], reminders: [15] },
});
step('create meeting (+ calendar event)', created.status === 201 && created.json?.data?.calendarEventId, created.json?.message);
const id = created.json?.data?.id;
if (!id) process.exit(1);

const cal = await call(`/calendar?from=${start.toISOString().slice(0, 10)}&to=${start.toISOString().slice(0, 10)}`);
step('meeting appears in the LifeOS calendar', (cal.json?.data?.items || []).some((e) => String(e.meetingId) === id));

step('start', (await call(`/meetings/${id}/start`, { method: 'POST' })).status === 200);
step('append transcript', (await call(`/meetings/${id}/transcript`, { method: 'POST', body: { segments: [{ seq: 0, text: 'Good morning everyone.', startMs: 0 }, { seq: 1, text: 'Paul will complete the database design by Friday.', startMs: 4000 }] } })).status === 201);
step('read transcript', (await call(`/meetings/${id}/transcript`)).json?.data?.items?.length === 2);

if (WITH_AUDIO) {
  const put = (i, b) => call(`/meetings/${id}/recording/chunks/${i}`, { method: 'PUT', raw: b, headers: { 'Content-Type': 'audio/webm' } });
  const a = await put(0, Buffer.from('smoke-chunk-0'));
  step('upload audio chunk 0', a.status === 201, a.json?.message || a.json?.code);
  step('re-upload is idempotent', (await put(0, Buffer.from('smoke-chunk-0'))).json?.data?.duplicate === true);
  step('upload audio chunk 1', (await put(1, Buffer.from('smoke-chunk-1'))).status === 201);
}

const ended = await call(`/meetings/${id}/end`, { method: 'POST', body: WITH_AUDIO ? { totalChunks: 2, durationSec: 10 } : {} });
step('end meeting', ended.status === 200 && ended.json?.data?.status === 'completed');

if (WITH_AUDIO) {
  let status = '';
  for (let i = 0; i < 45 && status !== 'ready'; i += 1) {
    await wait(2000);
    status = (await call(`/meetings/${id}`)).json?.data?.recording?.status;
  }
  step('recording finalised in the background', status === 'ready', `status=${status}`);
  const url = await call(`/meetings/${id}/recording/url`);
  const ok = url.status === 200 && (await fetch(url.json.data.url)).ok;
  step('signed playback URL works', ok);
}

const exp = await call(`/meetings/${id}/export?kind=transcript&format=pdf`);
step('export transcript PDF', exp.status === 200);

if (caps.ai) {
  const ask = await call(`/meetings/${id}/ask`, { method: 'POST', body: { question: 'Who was assigned the database task?' } });
  step('ask this meeting', ask.status === 200 && Boolean(ask.json?.data?.answer), (ask.json?.data?.answer || ask.json?.message || '').slice(0, 90));
} else {
  console.log('SKIP  ask this meeting (AI not configured)');
}

const del = await call(`/meetings/${id}`, { method: 'DELETE' });
step('delete meeting (cascades transcript, audio, calendar event)', del.status === 200);
step('deleted meeting is gone', (await call(`/meetings/${id}`)).status === 404);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
