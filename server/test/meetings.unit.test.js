/**
 * Meetings — pure-logic unit tests. No database or network needed:
 *   node --test test/meetings.unit.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.AI_PROVIDER = 'anthropic';
process.env.AI_API_KEY = 'test-key';
process.env.STT_PROVIDER = 'deepgram';
process.env.STT_API_KEY = 'test-key';

const { expandRecurrence, zonedTimeToUtc, zonedParts } = await import('../src/utils/recurrence.js');
const { chunkSegments } = await import('../src/utils/transcript.js');
const ai = await import('../src/services/ai.service.js');
const stt = await import('../src/services/stt.service.js');
const ex = await import('../src/services/meetingExport.service.js');
const { keywordsOf } = await import('../src/services/meetingAsk.service.js');
const { z } = await import('zod');

const iso = (d) => d.toISOString();

test('recurrence: daily / weekly / monthly / custom / caps', () => {
  const base = { startAt: '2027-01-04T09:00:00Z', endAt: '2027-01-04T10:00:00Z', timezone: 'UTC' };
  assert.equal(expandRecurrence({ ...base, recurrence: { frequency: 'daily', interval: 1, until: '2027-01-08T23:59:59Z' } }).length, 5);
  const weekly = expandRecurrence({ ...base, recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: [1, 3], until: '2027-01-20T00:00:00Z' } });
  assert.deepEqual(weekly.map((o) => iso(o.startAt).slice(5, 10)), ['01-04', '01-06', '01-11', '01-13', '01-18']);
  const monthly = expandRecurrence({ ...base, startAt: '2027-01-31T09:00:00Z', endAt: '2027-01-31T10:00:00Z', recurrence: { frequency: 'monthly', interval: 1 } }, { maxCount: 4 });
  assert.deepEqual(monthly.map((o) => iso(o.startAt).slice(0, 10)), ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  const custom = expandRecurrence({ ...base, recurrence: { frequency: 'custom', interval: 2 } }, { maxCount: 3 });
  assert.deepEqual(custom.map((o) => iso(o.startAt).slice(8, 10)), ['04', '06', '08']);
  assert.equal(expandRecurrence({ ...base, recurrence: { frequency: 'daily' } }).length, 60);
  assert.equal(expandRecurrence({ ...base, recurrence: { frequency: 'none' } }).length, 1);
});

test('recurrence: wall-clock time is preserved across daylight-saving changes', () => {
  const start = zonedTimeToUtc({ y: 2027, m: 3, d: 12, h: 9, mi: 0 }, 'America/New_York');
  const r = expandRecurrence(
    { startAt: start, endAt: new Date(start.getTime() + 3600e3), timezone: 'America/New_York', recurrence: { frequency: 'daily', interval: 1 } },
    { maxCount: 5 }
  );
  assert.ok(r.every((o) => zonedParts(o.startAt, 'America/New_York').h === 9));
  assert.equal(iso(r[0].startAt).slice(11, 13), '14'); // EST
  assert.equal(iso(r[4].startAt).slice(11, 13), '13'); // EDT
});

test('transcript chunking covers every line, in order, under the size limit', () => {
  const segs = Array.from({ length: 1000 }, (_, i) => ({ seq: i, text: 'word '.repeat(40), startMs: i * 3000, speakerLabel: 'Speaker 1' }));
  const chunks = chunkSegments(segs, 24000);
  assert.ok(chunks.length > 1);
  assert.equal(chunks[0].startSeq, 0);
  assert.equal(chunks.at(-1).endSeq, 999);
  chunks.forEach((c, i) => {
    if (i > 0) assert.equal(c.startSeq, chunks[i - 1].endSeq + 1);
    assert.ok(c.text.length <= 24500);
  });
});

test('ai: JSON extraction, repair retry, permanent vs retryable errors, key never in body', async () => {
  assert.equal(ai.extractJson('Sure!\n```json\n{"a":1}\n```').a, 1);
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const text = calls.length === 1 ? 'not json' : '{"summary":"ok","items":["x"]}';
    return { ok: true, status: 200, headers: new Headers(), text: async () => '', json: async () => ({ content: [{ type: 'text', text }] }) };
  };
  const schema = z.object({ summary: z.string(), items: z.array(z.string()).default([]) });
  const out = await ai.generateJson({ system: 's', prompt: 'p', schema });
  assert.equal(out.summary, 'ok');
  assert.equal(calls.length, 2, 'one repair attempt');
  assert.ok(calls[0].url.endsWith('/v1/messages'));
  assert.equal(calls[0].init.headers['x-api-key'], 'test-key');
  assert.ok(!calls[0].init.body.includes('test-key'));

  globalThis.fetch = async () => ({ ok: false, status: 401, headers: new Headers(), text: async () => 'bad key' });
  await assert.rejects(() => ai.generateText({ system: 's', prompt: 'p' }), (e) => e.permanent === true);
});

test('stt: Deepgram parsing keeps offsets, diarization labels and confidence bounds', () => {
  const segs = stt.parseDeepgram(
    { results: { utterances: [{ start: 1.2, end: 3.4, confidence: 0.98, transcript: ' Good morning everyone. ', speaker: 0 }, { start: 4, end: 6, transcript: 'Auth is done.', speaker: 1 }] } },
    { offsetMs: 1000, diarize: true }
  );
  assert.equal(segs.length, 2);
  assert.equal(segs[0].startMs, 2200);
  assert.equal(segs[0].text, 'Good morning everyone.');
  assert.equal(segs[1].speakerLabel, 'Speaker 2');
  assert.equal(stt.parseDeepgram({ results: { utterances: [{ start: 0, end: 1, transcript: 'hi', speaker: 0 }] } })[0].speakerLabel, 'Speaker', 'no fake identities without diarization');
  assert.equal(stt.parseDeepgram({ results: { utterances: [] } }).length, 0);
});

test('export: every format builds a valid file; CSV neutralises formula injection', async () => {
  const meeting = {
    title: 'Sprint: DB & Auth', timezone: 'Africa/Monrovia', startAt: new Date('2027-01-04T09:00:00Z'), endAt: new Date('2027-01-04T10:00:00Z'), participants: [],
    summary: { executiveSummary: 'Team reviewed auth. Naïve “quotes” 日本語', keyPoints: ['Auth done'], decisions: ['Ship v1'], questions: [], nextSteps: ['Design DB'], topics: ['auth'] },
    minutes: { content: '# Minutes\n\n**Date:** Monday\n\n## Decisions\n- Ship v1' },
  };
  const segments = Array.from({ length: 300 }, (_, i) => ({ seq: i, startMs: i * 4000, speakerLabel: 'Speaker 1', text: `Line ${i} about the database.` }));
  const actionItems = [{ task: '=HYPERLINK("http://x")', assigneeName: 'Paul', deadline: new Date('2027-01-08T12:00:00Z'), priority: 'high', status: 'pending' }];
  for (const [kind, formats] of Object.entries(ex.EXPORT_MATRIX)) {
    for (const f of formats) {
      const r = await ex.buildExport(kind, f, { meeting, segments, actionItems });
      const head = r.buffer.subarray(0, 4).toString('latin1');
      if (f === 'pdf') assert.equal(head, '%PDF', `${kind}.${f}`);
      else if (f === 'docx') assert.ok(head.startsWith('PK'), `${kind}.${f}`);
      else assert.ok(r.buffer.length > 20);
    }
  }
  const csv = (await ex.buildExport('action-items', 'csv', { meeting, actionItems })).buffer.toString('utf8');
  assert.ok(csv.includes(`"'=HYPERLINK`));
  assert.ok(ex.isExportAllowed('summary', 'pdf') && !ex.isExportAllowed('summary', 'csv'));
});

test('ask: keyword extraction drops filler words', () => {
  assert.deepEqual(keywordsOf('Who was assigned the database task?'), ['assigned', 'database', 'task']);
});
