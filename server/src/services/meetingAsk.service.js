import { TranscriptSegment, ActionItem } from '../models/index.js';
import * as ai from './ai.service.js';
import { segmentLine, fmtClock, speakerOf } from '../utils/transcript.js';

/**
 * "Ask this meeting": answers from the meeting's own stored data only.
 *  - Small transcripts are sent whole.
 *  - Large transcripts use retrieval (keyword/text search + neighbouring lines + lines by a
 *    named speaker), so a 2-hour meeting never has to fit into one prompt.
 * Answers must cite transcript lines as [seq]; citations that don't exist are discarded.
 */

const FULL_TRANSCRIPT_CHARS = 60000;
const RETRIEVAL_CHARS = 40000;
const STOP = new Set('the a an and or of to in on for with about what who when where why how did does do is are was were be been this that these those from by at as it its our we they you your me my his her their there any has have had will would should could can said say says tell mention mentioned discuss discussed meeting'.split(' '));

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function keywordsOf(question) {
  return [...new Set(question.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)))].slice(0, 8);
}

async function retrieve(meetingId, question, speakerNames) {
  const kws = keywordsOf(question);
  const picked = new Map();
  const add = (rows) => rows.forEach((r) => picked.set(r.seq, r));

  if (kws.length) {
    let hits = [];
    try {
      hits = await TranscriptSegment.find(
        { meetingId, $text: { $search: kws.join(' ') } },
        { score: { $meta: 'textScore' }, seq: 1, speakerLabel: 1, speakerName: 1, text: 1, startMs: 1 }
      )
        .sort({ score: { $meta: 'textScore' } })
        .limit(30)
        .lean();
    } catch {
      hits = [];
    }
    if (!hits.length) {
      hits = await TranscriptSegment.find({ meetingId, text: new RegExp(kws.map(escapeRegex).join('|'), 'i') })
        .sort({ seq: 1 })
        .limit(30)
        .select('seq speakerLabel speakerName text startMs')
        .lean();
    }
    add(hits);
    // Neighbouring lines give the answer its context.
    const around = [...new Set(hits.flatMap((h) => [h.seq - 1, h.seq + 1]))].filter((n) => n >= 0 && !picked.has(n));
    if (around.length) {
      add(await TranscriptSegment.find({ meetingId, seq: { $in: around } }).select('seq speakerLabel speakerName text startMs').lean());
    }
  }

  // "What did Sarah say…": include that speaker's lines.
  const q = question.toLowerCase();
  const mentioned = speakerNames.filter((n) => n && q.includes(n.toLowerCase()));
  for (const name of mentioned.slice(0, 2)) {
    add(
      await TranscriptSegment.find({ meetingId, $or: [{ speakerName: new RegExp(`^${escapeRegex(name)}$`, 'i') }, { speakerLabel: new RegExp(`^${escapeRegex(name)}$`, 'i') }] })
        .sort({ seq: 1 })
        .limit(40)
        .select('seq speakerLabel speakerName text startMs')
        .lean()
    );
  }

  const ordered = [...picked.values()].sort((a, b) => a.seq - b.seq);
  const out = [];
  let chars = 0;
  for (const s of ordered) {
    const line = segmentLine(s);
    if (chars + line.length > RETRIEVAL_CHARS) break;
    out.push(s);
    chars += line.length;
  }
  return out;
}

export async function askAboutMeeting({ meeting, question, history = [] }) {
  const meetingId = meeting._id;
  const [stats] = await TranscriptSegment.aggregate([
    { $match: { meetingId } },
    { $group: { _id: null, chars: { $sum: { $strLenCP: '$text' } }, count: { $sum: 1 } } },
  ]);
  const actionItems = await ActionItem.find({ meetingId }).sort({ createdAt: 1 }).lean();
  const speakerRows = await TranscriptSegment.aggregate([
    { $match: { meetingId } },
    { $group: { _id: null, names: { $addToSet: '$speakerName' }, labels: { $addToSet: '$speakerLabel' } } },
  ]);
  const speakerNames = [...(speakerRows[0]?.names || []), ...(speakerRows[0]?.labels || []), ...meeting.participants.map((p) => p.name)].filter(Boolean);

  let segments;
  let mode;
  if (!stats) {
    segments = [];
    mode = 'none';
  } else if (stats.chars <= FULL_TRANSCRIPT_CHARS) {
    segments = await TranscriptSegment.find({ meetingId }).sort({ seq: 1 }).select('seq speakerLabel speakerName text startMs').lean();
    mode = 'full';
  } else {
    segments = await retrieve(meetingId, question, speakerNames);
    mode = 'retrieval';
  }

  const tz = meeting.timezone || 'UTC';
  const context = [
    `MEETING: "${meeting.title}" on ${new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: tz }).format(meeting.startedAt || meeting.startAt)} (${tz})`,
    `INVITED PARTICIPANTS: ${meeting.participants.map((p) => p.name).join(', ') || 'none listed'}`,
    meeting.agenda ? `AGENDA: ${meeting.agenda}` : '',
    meeting.summary?.executiveSummary ? `AI SUMMARY: ${meeting.summary.executiveSummary}\nDECISIONS: ${(meeting.summary.decisions || []).join('; ') || 'none'}` : '',
    meeting.minutes?.content ? `MINUTES:\n${meeting.minutes.content.slice(0, 6000)}` : '',
    `ACTION ITEMS:\n${actionItems.length ? actionItems.map((a) => `- ${a.task} | assigned: ${a.assigneeName || 'unassigned'} | due: ${a.deadline ? a.deadline.toISOString().slice(0, 10) : a.deadlineText || 'none'} | ${a.status}`).join('\n') : 'none'}`,
    segments.length
      ? `TRANSCRIPT${mode === 'retrieval' ? ' (relevant excerpts only)' : ''}:\n${segments.map(segmentLine).join('\n')}`
      : 'TRANSCRIPT: not available',
  ]
    .filter(Boolean)
    .join('\n\n');

  const convo = history
    .slice(-4)
    .map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${String(h.content).slice(0, 800)}`)
    .join('\n');

  const answer = await ai.generateText({
    system: `You answer questions about ONE meeting using only the material provided.
- If the answer is not in the material, reply exactly: "I couldn't find that in this meeting's transcript or notes." Do not guess or use outside knowledge.
- Cite transcript evidence with the line number in square brackets, e.g. [42]. Only cite numbers that appear in the material.
- Speaker labels like "Speaker 2" are automatic and are not verified identities; do not claim to know who someone really is.
- Be concise and direct.`,
    prompt: `${context}\n\n${convo ? `PREVIOUS CONVERSATION:\n${convo}\n\n` : ''}QUESTION: ${question}`,
    maxTokens: 900,
  });

  const bySeq = new Map(segments.map((s) => [s.seq, s]));
  const cited = [...new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => parseInt(m[1], 10)))].filter((n) => bySeq.has(n));
  return {
    answer: answer.trim(),
    mode,
    citations: cited.slice(0, 8).map((n) => {
      const s = bySeq.get(n);
      return { seq: n, startMs: s.startMs, clock: fmtClock(s.startMs), speaker: speakerOf(s), text: s.text.slice(0, 220) };
    }),
  };
}
