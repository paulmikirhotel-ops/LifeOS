/**
 * Meetings — AI pipeline orchestration with in-memory data and a fake LLM (no DB, no network):
 *   node --test test/meetings.pipeline.test.js
 *
 * Verifies: long transcripts are chunked, finished chunks survive a failure and are not re-paid
 * for on retry, items citing lines that don't exist are dropped (no invention), and minutes are
 * rendered from stored facts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.AI_PROVIDER = 'anthropic';
process.env.AI_API_KEY = 'test-key';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
mongoose.set('bufferCommands', false); // notifications fail fast instead of waiting for a DB
const { Meeting, TranscriptSegment, ActionItem, Job } = await import('../src/models/index.js');
const { __test } = await import('../src/services/meetingPipeline.service.js');

const setPath = (o, p, v) => { const k = p.split('.'); let c = o; for (let i = 0; i < k.length - 1; i += 1) { c[k[i]] ??= {}; c = c[k[i]]; } c[k.at(-1)] = v; };
const delPath = (o, p) => { const k = p.split('.'); let c = o; for (let i = 0; i < k.length - 1; i += 1) c = c?.[k[i]]; if (c) delete c[k.at(-1)]; };
class Q { constructor(v) { this.v = v; } select() { return this; } sort() { return this; } lean() { return Promise.resolve(this.v); } then(a, b) { return Promise.resolve(this.v).then(a, b); } }

const M = 'm1';
const meeting = {
  _id: M, tenantId: 't1', organizerId: 'u1', title: 'Sprint planning', timezone: 'Africa/Monrovia',
  startAt: new Date('2027-01-04T09:00:00Z'), endAt: new Date('2027-01-04T10:00:00Z'),
  startedAt: new Date('2027-01-04T09:00:00Z'), endedAt: new Date('2027-01-04T10:00:00Z'),
  agenda: '1. Status', location: 'Zoom', participants: [{ name: 'Paul', role: 'chair' }], processing: {}, summary: {}, analysis: {},
};
const segs = Array.from({ length: 1000 }, (_, i) => ({ _id: `s${i}`, meetingId: M, seq: i, startMs: i * 3000, speakerLabel: `Speaker ${(i % 2) + 1}`, text: 'discussing the database and authentication '.repeat(3) }));
let actionItems = [];
const jobDoc = { _id: 'j1', payload: {} };
const enqueued = [];

Meeting.findById = (id) => new Q(id === M ? { ...meeting, analysis: meeting.analysis } : null);
Meeting.updateOne = async (_f, u) => { for (const [p, v] of Object.entries(u.$set || {})) setPath(meeting, p, v); for (const p of Object.keys(u.$unset || {})) delPath(meeting, p); return { modifiedCount: 1 }; };
TranscriptSegment.find = () => new Q(segs);
TranscriptSegment.aggregate = async () => [{ _id: 'Speaker 1' }, { _id: 'Speaker 2' }];
ActionItem.deleteMany = async () => { actionItems = actionItems.filter((a) => a.source !== 'ai'); };
ActionItem.insertMany = async (docs) => { actionItems.push(...docs); };
ActionItem.find = () => new Q(actionItems);
Job.findById = () => new Q(jobDoc);
Job.updateOne = async (_f, u) => { for (const [p, v] of Object.entries(u.$set || {})) setPath(jobDoc, p, v); };
Job.findOneAndUpdate = async (f, u) => { enqueued.push(f.type ?? u.$setOnInsert?.type); return {}; };

let mapCalls = 0;
let failAt = 3;
globalThis.fetch = async (_url, init) => {
  const prompt = JSON.parse(init.body).messages[0].content;
  const reply = (obj) => ({ ok: true, status: 200, headers: new Headers(), text: async () => '', json: async () => ({ content: [{ type: 'text', text: `\`\`\`json\n${JSON.stringify(obj)}\n\`\`\`` }] }) });
  if (prompt.includes('This is part')) {
    mapCalls += 1;
    if (mapCalls === failAt) return { ok: false, status: 401, headers: new Headers(), text: async () => 'boom' };
    const s = +/lines \[(\d+)\]/.exec(prompt)[1];
    return reply({
      overview: 'Part overview',
      keyPoints: [{ text: 'Auth finished', seq: s }, { text: 'HALLUCINATED', seq: 999999 }],
      decisions: [{ text: 'Ship v1', seq: s + 1 }, { text: 'Invented decision', seq: 888888 }],
      questions: [], nextSteps: [{ text: 'Design DB', seq: s + 2 }], topics: ['auth'],
      actionItems: [{ task: 'Complete database design', assignee: 'Paul', deadline: '2027-01-08', deadlineText: 'by Friday', priority: 'high', seq: s + 3 }, { task: 'Ghost task', assignee: null, seq: 777777 }],
    });
  }
  if (prompt.includes('Combine them into the final summary')) return reply({ executiveSummary: 'The team reviewed auth and database work.', keyPoints: ['Auth finished'], decisions: ['Ship v1'], questions: [], nextSteps: ['Design DB'], topics: ['auth'] });
  if (prompt.includes('These action items were extracted')) {
    const items = JSON.parse(prompt.split('ITEMS:\n')[1]);
    return reply({ actionItems: [items[0], { task: 'Fabricated by reducer', assignee: 'Eve', seq: 555555 }] });
  }
  if (prompt.includes('narrative parts of formal meeting minutes')) return reply({ discussions: [{ heading: 'Authentication', points: ['Authentication was completed']}], decisions: ['Ship v1'], anyOtherBusiness: [], nextMeeting: null, closing: null });
  throw new Error('unexpected prompt');
};

test('analysis is chunked, resumable after a failure, and refuses to invent', async () => {
  await assert.rejects(() => __test.analyze({ _id: 'j1', meetingId: M, payload: {} }), (e) => e.permanent === true);
  assert.equal(jobDoc.payload.chunkResults.length, 2, 'finished chunks are saved');
  const total = jobDoc.payload.total;
  assert.ok(total >= 4, 'a long transcript is split into several chunks');
  assert.ok(!meeting.summary.executiveSummary, 'nothing is written on failure');

  const before = mapCalls;
  failAt = -1;
  await __test.analyze({ _id: 'j1', meetingId: M, payload: {} });
  assert.equal(mapCalls - before, total - 2, 'retry only processes the remaining chunks');
  assert.equal(meeting.summary.executiveSummary, 'The team reviewed auth and database work.');
  assert.equal(meeting.processing.summary, 'done');
  assert.equal(meeting.processing.actionItems, 'done');

  const notes = meeting.analysis.notes;
  assert.ok(notes.keyPoints.every((k) => k.seq !== 999999), 'points citing missing lines are dropped');
  assert.ok(notes.decisions.every((d) => d.seq !== 888888));
  assert.equal(actionItems.length, 1, 'ghost and fabricated tasks are dropped');
  assert.equal(actionItems[0].task, 'Complete database design');
  assert.equal(actionItems[0].assigneeName, 'Paul');
  assert.ok(actionItems[0].deadline.toISOString().startsWith('2027-01-08'));
  assert.equal(actionItems[0].source, 'ai');
  assert.ok(enqueued.includes('minutes'));
});

test('minutes are rendered from stored facts and never invent a next meeting', async () => {
  await __test.buildMinutes(M);
  const md = meeting.minutes.content;
  for (const h of ['## Participants', '## Agenda', '## Discussions', '## Decisions', '## Action Items', '## Any Other Business', '## Next Meeting', '## Closing']) {
    assert.ok(md.includes(h), h);
  }
  assert.ok(md.includes('**Chairperson:** Paul'));
  assert.ok(md.includes('Complete database design — Paul (due: 2027-01-08; priority: high)'));
  assert.ok(md.includes('## Next Meeting\nNot stated'));
  assert.equal(meeting.processing.minutes, 'done');
});
