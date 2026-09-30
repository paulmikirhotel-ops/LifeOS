import { z } from 'zod';
import { Meeting, TranscriptSegment, ActionItem, Job } from '../models/index.js';
import { env } from '../config/env.js';
import * as storage from './storage.service.js';
import * as stt from './stt.service.js';
import * as ai from './ai.service.js';
import { registerJobHandler, enqueue, updatePayload } from './job.service.js';
import { chunkSegments, fmtClock } from '../utils/transcript.js';
import * as notificationService from './notification.service.js';

/**
 * Post-meeting pipeline (all background jobs, all retryable, all independent):
 *
 *   finalize_recording → transcribe → analyze → minutes
 *
 * Hard guarantees:
 *  - The recording is never deleted or altered because an AI/STT step fails.
 *  - Each stage records its own state (processing.*) so the UI can show per-stage status
 *    and offer "Try again".
 *  - The AI only sees transcript text, and every extracted item must cite a real transcript
 *    line ([seq]); items without valid evidence are dropped.
 */

// ── shared helpers ─────────────────────────────────────────────────────

const setStage = (meetingId, patch) => {
  const $set = {};
  const $unset = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) $unset[`processing.${k}`] = 1;
    else $set[`processing.${k}`] = v;
  }
  return Meeting.updateOne({ _id: meetingId }, { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) });
};

async function notifyOrganizer(meeting, title, message) {
  notificationService.notify({
    tenantId: meeting.tenantId,
    userId: meeting.organizerId,
    type: 'meeting',
    module: 'meeting',
    title,
    message,
    relatedId: meeting._id,
    priority: 'normal',
  });
}

async function loadSegments(meetingId) {
  return TranscriptSegment.find({ meetingId }).sort({ seq: 1 }).select('seq speakerLabel speakerName text startMs').lean();
}

// ── 1. finalize recording ──────────────────────────────────────────────

async function finalizeRecording(job) {
  const meeting = await Meeting.findById(job.meetingId).select('+recording.seen');
  if (!meeting) return;
  const { tenantId, _id } = meeting;
  if (meeting.recording.status === 'ready' && meeting.recording.storageKey) return; // idempotent

  const seen = [...new Set(meeting.recording.seen || [])].sort((a, b) => a - b);
  if (!seen.length) {
    await Meeting.updateOne({ _id }, { $set: { 'recording.status': 'none' } });
    return; // nothing was recorded (e.g. transcript pasted manually)
  }
  const total = job.payload?.totalChunks ?? seen[seen.length - 1] + 1;
  const missing = Math.max(0, total - seen.length);

  const mime = meeting.recording.mimeType || 'audio/webm';
  const dest = storage.keys.recording(tenantId, _id, storage.extFor(mime));
  const chunkKeys = seen.map((i) => storage.keys.chunk(tenantId, _id, i));

  await Meeting.updateOne({ _id }, { $set: { 'recording.status': 'uploading' } });
  const size = await storage.assemble(chunkKeys, dest, mime);
  await Meeting.updateOne(
    { _id },
    {
      $set: {
        'recording.status': 'ready',
        'recording.storageKey': dest,
        'recording.sizeBytes': size,
        'recording.chunkCount': seen.length,
        'recording.missingChunks': missing,
        'recording.durationSec': job.payload?.durationSec ?? meeting.durationSec,
      },
    }
  );
  // Only after the assembled file exists do we remove the temporary chunks.
  await Promise.all(chunkKeys.map((k) => storage.deleteObject(k).catch(() => {})));

  const next = env.stt.batch && stt.sttConfigured() ? 'transcribe' : 'analyze';
  const hasSegments = (await TranscriptSegment.countDocuments({ meetingId: _id })) > 0;
  if (next === 'transcribe') {
    await setStage(_id, { transcript: 'pending' });
    await enqueue('transcribe', { tenantId, meetingId: _id });
  } else if (hasSegments && ai.aiConfigured()) {
    await setStage(_id, { summary: 'pending', actionItems: 'pending' });
    await enqueue('analyze', { tenantId, meetingId: _id });
  }
}

// ── 2. batch transcription (diarized) ─────────────────────────────────

async function transcribeRecording(job) {
  const meeting = await Meeting.findById(job.meetingId);
  if (!meeting?.recording?.storageKey) throw Object.assign(new Error('No recording to transcribe'), { permanent: true });
  await setStage(meeting._id, { transcript: 'processing' });

  const { url } = await storage.getSignedReadUrl(meeting.recording.storageKey, { meetingId: meeting._id, ttlSec: 3600 });
  let segments;
  if (storage.storageDriver() === 'local') {
    // Dev only: the provider cannot reach localhost, so send bytes.
    const { stream } = await storage.getObject(meeting.recording.storageKey);
    const parts = [];
    for await (const p of stream) parts.push(p);
    segments = await stt.transcribeBuffer(Buffer.concat(parts), meeting.recording.mimeType, { diarize: true });
  } else {
    segments = await stt.transcribeUrl(url, { diarize: true });
  }

  if (segments.length) {
    // Replace live/batch segments ONLY after the new transcript exists (a failure keeps the live one).
    await TranscriptSegment.deleteMany({ meetingId: meeting._id, source: { $in: ['live', 'batch'] } });
    await TranscriptSegment.insertMany(
      segments.map((s, i) => ({ ...s, tenantId: meeting.tenantId, meetingId: meeting._id, seq: i, source: 'batch' })),
      { ordered: false }
    );
    await Meeting.updateOne({ _id: meeting._id }, { $set: { transcriptSeq: segments.length } });
  }
  await setStage(meeting._id, { transcript: 'done' });

  if (segments.length && ai.aiConfigured()) {
    await setStage(meeting._id, { summary: 'pending', actionItems: 'pending' });
    await enqueue('analyze', { tenantId: meeting.tenantId, meetingId: meeting._id });
  }
}

// ── 3. analysis: map-reduce over the transcript ───────────────────────

const ev = z.object({ text: z.string().min(1), seq: z.number().int().nullable().optional() });
const chunkSchema = z.object({
  overview: z.string().default(''),
  keyPoints: z.array(ev).default([]),
  decisions: z.array(ev).default([]),
  questions: z.array(ev).default([]),
  nextSteps: z.array(ev).default([]),
  topics: z.array(z.string()).default([]),
  actionItems: z
    .array(
      z.object({
        task: z.string().min(1),
        assignee: z.string().nullable().optional(),
        deadlineText: z.string().nullable().optional(),
        deadline: z.string().nullable().optional(),
        priority: z.enum(['urgent', 'high', 'medium', 'low']).nullable().optional(),
        seq: z.number().int().nullable().optional(),
      })
    )
    .default([]),
});

const finalSchema = z.object({
  executiveSummary: z.string().default(''),
  keyPoints: z.array(z.string()).default([]),
  decisions: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
  nextSteps: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
});

const actionReduceSchema = z.object({
  actionItems: z
    .array(
      z.object({
        task: z.string().min(1),
        assignee: z.string().nullable().optional(),
        deadlineText: z.string().nullable().optional(),
        deadline: z.string().nullable().optional(),
        priority: z.enum(['urgent', 'high', 'medium', 'low']).nullable().optional(),
        seq: z.number().int().nullable().optional(),
      })
    )
    .default([]),
});

const FIDELITY = `STRICT RULES:
- Use ONLY what is explicitly said in the transcript. Never add facts, names, numbers, dates or decisions that are not there.
- Each transcript line starts with [seq]. Every item you output must cite the [seq] of the line that best supports it.
- A "decision" must be something the participants explicitly agreed or decided. Discussion or opinions are not decisions.
- An "actionItem" must be a concrete task someone committed to or was asked to do. Do not turn general discussion into tasks.
- If a section has nothing supported by the transcript, return an empty array for it.
- Write in the same language as the transcript.`;

function metaLine(meeting) {
  const tz = meeting.timezone || 'UTC';
  const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: tz }).format(meeting.startAt);
  return `Meeting: "${meeting.title}". Date: ${date} (${tz}). Use this date to resolve relative deadlines such as "by Friday" into an ISO date (YYYY-MM-DD); if a deadline cannot be resolved with certainty, leave "deadline" null and put the spoken words in "deadlineText".`;
}

async function mapChunk(meeting, chunk, total) {
  const prompt = `${metaLine(meeting)}

This is part ${chunk.index + 1} of ${total} of the transcript (lines [${chunk.startSeq}]–[${chunk.endSeq}]).

Return JSON with this shape:
{"overview": string (2-3 sentences about this part),
 "keyPoints": [{"text": string, "seq": number}],
 "decisions": [{"text": string, "seq": number}],
 "questions": [{"text": string, "seq": number}]  // open questions needing follow-up,
 "nextSteps": [{"text": string, "seq": number}],
 "topics": [string],
 "actionItems": [{"task": string, "assignee": string|null, "deadlineText": string|null, "deadline": "YYYY-MM-DD"|null, "priority": "urgent"|"high"|"medium"|"low"|null, "seq": number}]}

TRANSCRIPT:
${chunk.text}`;
  const out = await ai.generateJson({ system: `You extract structured meeting notes from transcripts.\n${FIDELITY}`, prompt, schema: chunkSchema, maxTokens: 2500 });
  // Drop anything whose citation is not a real line of THIS chunk (guards against invention).
  const valid = (x) => Number.isInteger(x.seq) && chunk.validSeqs.has(x.seq);
  return {
    overview: out.overview,
    keyPoints: out.keyPoints.filter(valid),
    decisions: out.decisions.filter(valid),
    questions: out.questions.filter(valid),
    nextSteps: out.nextSteps.filter(valid),
    topics: out.topics.slice(0, 15),
    actionItems: out.actionItems.filter(valid),
  };
}

function mergeNotes(list) {
  const cat = (k) => list.flatMap((n) => n[k] || []);
  return {
    overviews: list.map((n) => n.overview).filter(Boolean),
    keyPoints: cat('keyPoints'),
    decisions: cat('decisions'),
    questions: cat('questions'),
    nextSteps: cat('nextSteps'),
    topics: [...new Set(cat('topics').map((t) => t.trim()))],
    actionItems: cat('actionItems'),
  };
}

const size = (o) => JSON.stringify(o).length;

/** Hierarchical reduce: if merged notes are too big for one request, condense groups first. */
async function condense(meeting, merged) {
  let notes = merged;
  let guard = 0;
  while (size(notes) > 40000 && guard < 4) {
    guard += 1;
    const half = Math.ceil(notes.overviews.length / 2) || 1;
    const groups = [notes.overviews.slice(0, half), notes.overviews.slice(half)].filter((g) => g.length);
    const condensed = [];
    for (const g of groups) {
      const text = await ai.generateText({
        system: `Condense meeting overviews into one accurate paragraph. Add nothing that is not in the input.`,
        prompt: g.join('\n\n'),
        maxTokens: 700,
      });
      condensed.push(text.trim());
    }
    notes = { ...notes, overviews: condensed, keyPoints: notes.keyPoints.slice(0, 120), questions: notes.questions.slice(0, 60), nextSteps: notes.nextSteps.slice(0, 60) };
  }
  return notes;
}

async function reduceSummary(meeting, notes) {
  const compact = {
    overviews: notes.overviews,
    keyPoints: notes.keyPoints.map((x) => x.text),
    decisions: notes.decisions.map((x) => x.text),
    questions: notes.questions.map((x) => x.text),
    nextSteps: notes.nextSteps.map((x) => x.text),
    topics: notes.topics,
  };
  const prompt = `${metaLine(meeting)}

Below are notes extracted from consecutive parts of one meeting. Combine them into the final summary. Remove duplicates, keep only what the notes support.

Return JSON: {"executiveSummary": string (one concise paragraph), "keyPoints": string[], "decisions": string[], "questions": string[], "nextSteps": string[], "topics": string[]}

NOTES:
${JSON.stringify(compact)}`;
  return ai.generateJson({ system: `You write accurate meeting summaries.\nDo not add anything that is not in the notes.`, prompt, schema: finalSchema, maxTokens: 3000 });
}

async function reduceActions(meeting, notes) {
  if (!notes.actionItems.length) return [];
  const prompt = `${metaLine(meeting)}

These action items were extracted from different parts of one meeting and may contain duplicates. Merge duplicates, keep each item's citation ("seq"), and keep only tasks that are concrete.

Return JSON: {"actionItems": [{"task": string, "assignee": string|null, "deadlineText": string|null, "deadline": "YYYY-MM-DD"|null, "priority": "urgent"|"high"|"medium"|"low"|null, "seq": number}]}

ITEMS:
${JSON.stringify(notes.actionItems)}`;
  const out = await ai.generateJson({ system: `You de-duplicate meeting action items. Never invent tasks, assignees or dates.`, prompt, schema: actionReduceSchema, maxTokens: 3000 });
  const seqs = new Set(notes.actionItems.map((a) => a.seq));
  return out.actionItems.filter((a) => Number.isInteger(a.seq) && seqs.has(a.seq));
}

export function parseIsoDate(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function analyze(job) {
  const meeting = await Meeting.findById(job.meetingId);
  if (!meeting) return;
  await setStage(meeting._id, { summary: 'processing', actionItems: 'processing', lastError: undefined });

  const segments = await loadSegments(meeting._id);
  if (!segments.length) throw Object.assign(new Error('There is no transcript to analyse yet'), { permanent: true });

  const chunks = chunkSegments(segments);
  // Resume support: chunk results are saved on the job so a retry never re-pays for finished chunks.
  const fresh = await Job.findById(job._id).lean();
  const saved = fresh?.payload?.chunkResults && fresh.payload.total === chunks.length ? fresh.payload.chunkResults : [];
  const results = [...saved];
  for (let i = results.length; i < chunks.length; i += 1) {
    results.push(await mapChunk(meeting, chunks[i], chunks.length));
    await updatePayload(job._id, { chunkResults: results, total: chunks.length });
  }

  const merged = await condense(meeting, mergeNotes(results));
  const [summary, actions] = await Promise.all([reduceSummary(meeting, merged), reduceActions(meeting, merged)]);

  await Meeting.updateOne(
    { _id: meeting._id },
    {
      $set: {
        summary: { ...summary, generatedAt: new Date() },
        'analysis.notes': merged,
        'analysis.segmentCount': segments.length,
        'analysis.generatedAt': new Date(),
      },
    }
  );
  await setStage(meeting._id, { summary: 'done' });

  // Replace only untouched AI items; manual items and items already pushed to Tasks are kept.
  await ActionItem.deleteMany({ meetingId: meeting._id, source: 'ai', taskId: { $exists: false }, status: 'pending' });
  if (actions.length) {
    await ActionItem.insertMany(
      actions.map((a) => ({
        tenantId: meeting.tenantId,
        meetingId: meeting._id,
        createdBy: meeting.organizerId,
        task: a.task.slice(0, 300),
        assigneeName: a.assignee?.slice(0, 120) || undefined,
        deadline: parseIsoDate(a.deadline),
        deadlineText: a.deadlineText?.slice(0, 120) || undefined,
        priority: a.priority || 'medium',
        status: 'pending',
        source: 'ai',
        sourceSeq: a.seq,
      }))
    );
  }
  await setStage(meeting._id, { actionItems: 'done', minutes: 'pending' });
  await enqueue('minutes', { tenantId: meeting.tenantId, meetingId: meeting._id });
}

// ── 4. minutes ────────────────────────────────────────────────────────

const minutesSchema = z.object({
  discussions: z.array(z.object({ heading: z.string(), points: z.array(z.string()).default([]) })).default([]),
  decisions: z.array(z.string()).default([]),
  anyOtherBusiness: z.array(z.string()).default([]),
  nextMeeting: z.string().nullable().optional(),
  closing: z.string().nullable().optional(),
});

function fmtDateTime(meeting) {
  const tz = meeting.timezone || 'UTC';
  const start = meeting.startedAt || meeting.startAt;
  const end = meeting.endedAt || meeting.endAt;
  const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: tz }).format(start);
  const t = (d) => new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: tz }).format(d);
  return { date, time: `${t(start)} – ${t(end)} (${tz})` };
}

/** Deterministic Markdown renderer: facts come from the database, only prose comes from the model. */
export function renderMinutes({ meeting, actionItems, content, speakers = [] }) {
  const { date, time } = fmtDateTime(meeting);
  const chair = meeting.participants.find((p) => p.role === 'chair');
  const invited = meeting.participants.map((p) => p.name);
  const L = [];
  L.push(`# Minutes of Meeting — ${meeting.title}`, '');
  L.push(`**Date:** ${date}`, `**Time:** ${time}`, `**Location:** ${meeting.location || 'Not stated'}`, `**Chairperson:** ${chair?.name || 'Not stated'}`, '');
  L.push('## Participants', ...(invited.length ? invited.map((n) => `- ${n}`) : ['- Not stated']));
  if (speakers.length) L.push('', `_Voices detected in the recording: ${speakers.join(', ')}. Attendance is not verified from audio._`);
  L.push('', '## Agenda', meeting.agenda?.trim() ? meeting.agenda.trim() : 'Not stated', '');
  L.push('## Discussions');
  if (content.discussions.length) {
    for (const d of content.discussions) L.push(`### ${d.heading}`, ...d.points.map((p) => `- ${p}`), '');
  } else L.push('No discussion points recorded.', '');
  L.push('## Decisions', ...(content.decisions.length ? content.decisions.map((d) => `- ${d}`) : ['- No decisions were recorded.']), '');
  L.push('## Action Items');
  if (actionItems.length) {
    for (const a of actionItems) {
      const due = a.deadline ? a.deadline.toISOString().slice(0, 10) : a.deadlineText || 'no deadline';
      L.push(`- ${a.task} — ${a.assigneeName || 'unassigned'} (due: ${due}; priority: ${a.priority})`);
    }
  } else L.push('- None recorded.');
  L.push('', '## Any Other Business', ...(content.anyOtherBusiness.length ? content.anyOtherBusiness.map((d) => `- ${d}`) : ['- None.']), '');
  L.push('## Next Meeting', content.nextMeeting || 'Not stated', '');
  L.push('## Closing', content.closing || 'Meeting closed.', '');
  return L.join('\n');
}

export async function buildMinutes(meetingId) {
  const meeting = await Meeting.findById(meetingId).select('+analysis.notes');
  if (!meeting) return;
  await setStage(meeting._id, { minutes: 'processing' });

  let notes = meeting.analysis?.notes;
  if (!notes) {
    // Regenerate path when analysis has not run: fail clearly instead of guessing.
    throw Object.assign(new Error('Run the AI summary first — minutes are built from it'), { permanent: true });
  }
  const prompt = `${metaLine(meeting)}
Agenda provided by the organizer: ${meeting.agenda?.trim() || '(none)'}

Using ONLY the notes below, write the narrative parts of formal meeting minutes.
Return JSON: {"discussions": [{"heading": string, "points": string[]}], "decisions": string[], "anyOtherBusiness": string[], "nextMeeting": string|null, "closing": string|null}
- Group discussions by topic (follow the agenda order when the notes match it).
- "nextMeeting": only if a next meeting date/time/plan was explicitly stated, else null.
- "anyOtherBusiness": only items explicitly raised as other business; usually empty.
- "closing": one neutral sentence only if the meeting's end was stated, else null.
- Use formal, past-tense minute style. Do not add anything not in the notes.

NOTES:
${JSON.stringify({
    overviews: notes.overviews,
    keyPoints: notes.keyPoints.map((x) => x.text),
    decisions: notes.decisions.map((x) => x.text),
    nextSteps: notes.nextSteps.map((x) => x.text),
    questions: notes.questions.map((x) => x.text),
  })}`;
  const content = await ai.generateJson({ system: `You write formal, accurate meeting minutes.\n${FIDELITY}`, prompt, schema: minutesSchema, maxTokens: 3500 });

  const [actionItems, speakerRows] = await Promise.all([
    ActionItem.find({ meetingId: meeting._id }).sort({ createdAt: 1 }).lean(),
    TranscriptSegment.aggregate([{ $match: { meetingId: meeting._id } }, { $group: { _id: { $ifNull: ['$speakerName', '$speakerLabel'] } } }, { $sort: { _id: 1 } }]),
  ]);
  const speakers = speakerRows.map((r) => r._id).filter((s) => s && s !== 'Speaker');
  const markdown = renderMinutes({ meeting, actionItems, content, speakers });

  await Meeting.updateOne({ _id: meeting._id }, { $set: { 'minutes.content': markdown, 'minutes.generatedAt': new Date(), 'minutes.editedAt': null } });
  await setStage(meeting._id, { minutes: 'done' });
  await notifyOrganizer(meeting, 'Meeting minutes ready', `AI summary and minutes for "${meeting.title}" are ready.`);
}

// ── registration ──────────────────────────────────────────────────────

export function registerMeetingJobs() {
  const fail = (stage, extra) => async (job, err) => {
    const patch = { [stage]: 'failed', lastError: String(err?.message || err).slice(0, 480) };
    if (extra) for (const k of extra) patch[k] = 'failed';
    await setStage(job.meetingId, patch);
  };
  registerJobHandler('finalize_recording', finalizeRecording, async (job, err) => {
    await Meeting.updateOne({ _id: job.meetingId }, { $set: { 'recording.status': 'failed', 'processing.lastError': String(err?.message).slice(0, 480) } });
  });
  registerJobHandler('transcribe', transcribeRecording, fail('transcript'));
  registerJobHandler('analyze', analyze, fail('summary', ['actionItems']));
  registerJobHandler('minutes', (job) => buildMinutes(job.meetingId), fail('minutes'));
}

export { fmtClock };

// Exposed for unit tests only.
export const __test = { analyze, buildMinutes, finalizeRecording, transcribeRecording };
