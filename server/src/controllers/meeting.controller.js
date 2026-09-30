import * as meetingService from '../services/meeting.service.js';
import { assertObjectId } from '../utils/objectId.js';
import { ApiError } from '../utils/ApiError.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const id = (req) => {
  assertObjectId(req.params.id);
  return req.params.id;
};

// ── meetings ────────────────────────────────────────────────────────────
export const capabilities = async (_req, res) => ok(res, meetingService.capabilities());
export const members = async (req, res) => ok(res, { items: await meetingService.listMembers(req.user) });
export const list = async (req, res) => ok(res, await meetingService.list(req.user, req.query));
export const get = async (req, res) => ok(res, await meetingService.get(req.user, id(req)));
export const create = async (req, res) => ok(res, await meetingService.create(req.user, req.body), 201);
export const update = async (req, res) => ok(res, await meetingService.update(req.user, id(req), req.body));
export async function remove(req, res) {
  const r = await meetingService.remove(req.user, id(req), { scope: req.query.scope });
  ok(res, { message: 'Meeting deleted', deleted: r.deleted });
}
export const start = async (req, res) => ok(res, await meetingService.start(req.user, id(req)));
export const end = async (req, res) => ok(res, await meetingService.end(req.user, id(req), req.body || {}));
export const cancel = async (req, res) => ok(res, await meetingService.cancel(req.user, id(req)));

// ── transcript ──────────────────────────────────────────────────────────
export const listTranscript = async (req, res) => ok(res, await meetingService.listTranscript(req.user, id(req), req.query));
export const appendTranscript = async (req, res) => ok(res, await meetingService.appendTranscript(req.user, id(req), req.body.segments), 201);
export const importTranscript = async (req, res) => ok(res, await meetingService.importTranscriptText(req.user, id(req), req.body.text), 201);
export const editSegment = async (req, res) => ok(res, await meetingService.editSegment(req.user, id(req), req.params.seq, req.body));
export const listSpeakers = async (req, res) => ok(res, await meetingService.listSpeakers(req.user, id(req)));
export const renameSpeaker = async (req, res) => ok(res, await meetingService.renameSpeaker(req.user, id(req), req.body));

// ── recording ───────────────────────────────────────────────────────────
export async function uploadChunk(req, res) {
  const r = await meetingService.uploadChunk(req.user, id(req), parseInt(req.params.index, 10), req.body, req.headers['content-type'] || '');
  ok(res, r, 201);
}
export async function transcribeChunk(req, res) {
  const r = await meetingService.transcribeChunk(req.user, id(req), req.body, req.headers['content-type'] || '', req.query.offsetMs || 0);
  ok(res, r);
}
export async function recordingUrl(req, res) {
  res.set('Cache-Control', 'no-store');
  ok(res, await meetingService.getRecordingUrl(req.user, id(req), `${req.protocol}://${req.get('host')}`));
}
/** Token-authorised (no cookie) so <audio> can use it; supports HTTP Range for seeking. */
export async function recordingStream(req, res) {
  const token = String(req.query.token || '');
  if (!token) throw ApiError.unauthorized('Playback link expired or invalid');
  const r = await meetingService.openRecordingStream(id(req), token, req.headers.range);
  res.set({
    'Content-Type': r.mimeType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'Content-Length': String(r.size),
  });
  if (r.contentRange) {
    res.status(206).set('Content-Range', r.contentRange);
  }
  r.stream.on('error', () => res.destroy());
  r.stream.pipe(res);
}

// ── AI processing ───────────────────────────────────────────────────────
export const retry = async (req, res) => ok(res, await meetingService.retry(req.user, id(req), req.body.stage), 202);
export const generateSummary = async (req, res) => ok(res, await meetingService.retry(req.user, id(req), 'analyze'), 202);
export const generateMinutes = async (req, res) => ok(res, await meetingService.retry(req.user, id(req), 'minutes'), 202);
export const getSummary = async (req, res) => ok(res, await meetingService.getSummary(req.user, id(req)));
export const getMinutes = async (req, res) => ok(res, await meetingService.getMinutes(req.user, id(req)));
export const saveMinutes = async (req, res) => ok(res, await meetingService.saveMinutes(req.user, id(req), req.body.content));
export const ask = async (req, res) => ok(res, await meetingService.ask(req.user, id(req), req.body));

// ── action items ────────────────────────────────────────────────────────
export const listActionItems = async (req, res) => ok(res, await meetingService.listActionItems(req.user, id(req)));
export const allActionItems = async (req, res) => ok(res, await meetingService.listAllActionItems(req.user, req.query));
export const createActionItem = async (req, res) => ok(res, await meetingService.createActionItem(req.user, id(req), req.body), 201);
export async function updateActionItem(req, res) {
  assertObjectId(req.params.itemId, 'itemId');
  ok(res, await meetingService.updateActionItem(req.user, id(req), req.params.itemId, req.body));
}
export async function removeActionItem(req, res) {
  assertObjectId(req.params.itemId, 'itemId');
  await meetingService.removeActionItem(req.user, id(req), req.params.itemId);
  ok(res, { message: 'Action item deleted' });
}
export async function taskFromItem(req, res) {
  assertObjectId(req.params.itemId, 'itemId');
  ok(res, await meetingService.createTaskFromActionItem(req.user, id(req), req.params.itemId), 201);
}
export const tasksFromItems = async (req, res) => ok(res, await meetingService.createTasksFromActionItems(req.user, id(req)), 201);

// ── export & sharing ────────────────────────────────────────────────────
export async function exportMeeting(req, res) {
  const { buffer, contentType, filename } = await meetingService.exportMeeting(req.user, id(req), req.query.kind, req.query.format);
  res.set({
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': String(buffer.length),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(buffer);
}
export const createShare = async (req, res) => ok(res, await meetingService.createShare(req.user, id(req), req.body), 201);
export const getShare = async (req, res) => ok(res, await meetingService.getShare(req.user, id(req)));
export const revokeShare = async (req, res) => ok(res, await meetingService.revokeShare(req.user, id(req)));
export async function publicMeeting(req, res) {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
  ok(res, await meetingService.getSharedMeeting(req.params.token));
}
