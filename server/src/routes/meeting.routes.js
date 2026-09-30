import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as meetingController from '../controllers/meeting.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/requireTenant.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { MEETING_TYPES, RECURRENCE_FREQUENCIES } from '../models/meeting.model.js';
import { ACTION_STATUSES, ACTION_PRIORITIES } from '../models/actionItem.model.js';
import { env } from '../config/env.js';
import { EXPORT_MATRIX } from '../services/meetingExport.service.js';

const router = Router();

// ── schemas ─────────────────────────────────────────────────────────────

const dateStr = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Must be a valid date/time');
const dayStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const digits = z.string().regex(/^\d+$/);

const timezone = z
  .string()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown time zone');

const participantSchema = z.object({
  userId: objectId.optional(),
  name: z.string().min(1).max(120),
  email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Valid email required').max(254).optional(),
  role: z.enum(['chair', 'attendee']).optional(),
});

const recurrenceSchema = z.object({
  frequency: z.enum(RECURRENCE_FREQUENCIES),
  interval: z.coerce.number().int().min(1).max(365).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  until: dateStr.optional(),
});

// Base object has NO refinements so .partial() stays legal (zod 4 rejects it otherwise).
const meetingBase = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  type: z.enum(MEETING_TYPES).optional(),
  agenda: z.string().max(10000).optional(),
  location: z.string().max(500).optional(),
  timezone: timezone.optional(),
  startAt: dateStr,
  endAt: dateStr,
  recurrence: recurrenceSchema.optional(),
  reminders: z.array(z.number().int().min(1).max(10080)).max(5).optional(),
  participants: z.array(participantSchema).max(50).optional(),
  notes: z.string().max(20000).optional(),
});

const endAfterStart = (v) => !v.startAt || !v.endAt || Date.parse(v.endAt) > Date.parse(v.startAt);
const endMsg = { message: 'endAt must be after startAt', path: ['endAt'] };

const createSchema = meetingBase.omit({ notes: true }).refine(endAfterStart, endMsg);
const updateSchema = meetingBase.partial().refine(endAfterStart, endMsg);

const listQuery = z.object({
  status: z.enum(['scheduled', 'live', 'completed', 'cancelled']).optional(),
  type: z.enum(MEETING_TYPES).optional(),
  scope: z.enum(['upcoming', 'past', 'all']).optional(),
  from: dayStr.optional(),
  to: dayStr.optional(),
  search: z.string().max(100).optional(),
  compact: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  page: digits.optional(),
  limit: digits.optional(),
});

const segmentSchema = z.object({
  seq: z.number().int().min(0),
  text: z.string().min(1).max(5000),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0).optional(),
  confidence: z.number().min(0).max(1).optional(),
  speakerLabel: z.string().max(60).optional(),
  speakerName: z.string().max(120).optional(),
  source: z.enum(['live', 'batch', 'manual']).optional(),
});
const appendSchema = z.object({ segments: z.array(segmentSchema).min(1).max(200) });
const segmentPatchSchema = z
  .object({ text: z.string().min(1).max(5000).optional(), speakerName: z.string().max(120).optional() })
  .refine((v) => v.text !== undefined || v.speakerName !== undefined, 'Nothing to update');
const segmentParams = z.object({ id: objectId, seq: z.coerce.number().int().min(0) });

const transcriptQuery = z.object({
  afterSeq: digits.optional(),
  limit: digits.optional(),
  q: z.string().max(100).optional(),
});

const actionBase = z.object({
  task: z.string().min(1).max(300),
  assigneeName: z.string().max(120).optional(),
  assigneeUserId: objectId.optional(),
  deadline: dateStr.nullable().optional(),
  priority: z.enum(ACTION_PRIORITIES).optional(),
  status: z.enum(ACTION_STATUSES).optional(),
});
const actionCreateSchema = actionBase;
const actionPatchSchema = actionBase.partial();

const endSchema = z.object({
  totalChunks: z.number().int().min(0).max(20000).optional(),
  durationSec: z.number().int().min(0).max(24 * 3600).optional(),
});
const importSchema = z.object({ text: z.string().min(1).max(500000) });
const speakerSchema = z.object({ label: z.string().min(1).max(60), name: z.string().max(120).optional() });
const retrySchema = z.object({ stage: z.enum(['finalize', 'transcribe', 'analyze', 'minutes']) });
const minutesSchema = z.object({ content: z.string().min(1).max(100000) });
const askSchema = z.object({
  question: z.string().trim().min(2).max(500),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) })).max(6).optional(),
});
const shareSchema = z.object({
  expiresInDays: z.number().int().min(1).max(30).optional(),
  includeTranscript: z.boolean().optional(),
});
const exportQuery = z.object({
  kind: z.enum(Object.keys(EXPORT_MATRIX)),
  format: z.enum(['txt', 'pdf', 'docx', 'csv']),
});
const deleteQuery = z.object({ scope: z.enum(['one', 'series']).optional() });
const chunkParams = z.object({ id: objectId, index: z.coerce.number().int().min(0).max(19999) });
const offsetQuery = z.object({ offsetMs: z.coerce.number().int().min(0).max(24 * 3600 * 1000).default(0) });
const itemsQuery = z.object({ status: z.enum(ACTION_STATUSES).optional(), mine: z.enum(['true', 'false']).optional() });

// Audio bodies are raw bytes (not JSON) and bounded by MEETING_CHUNK_MAX_MB.
const rawAudio = express.raw({ type: () => true, limit: env.meetings.chunkMaxBytes });

// Per-user limiters (keyed by user id once authenticated) for the two chatty audio endpoints.
const perUser = (limit, message) =>
  rateLimit({
    windowMs: 60 * 1000,
    limit,
    keyGenerator: (req) => `u:${req.user?.id || 'anon'}`,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: { keyGeneratorIpFallback: false },
    message: { success: false, message, code: 'RATE_LIMITED' },
  });
const chunkLimiter = perUser(60, 'Uploading audio too quickly');
const liveClipLimiter = perUser(20, 'Too many live transcript clips');
const askLimiter = perUser(15, 'Too many questions, slow down');

// Transcript ingestion is the chatty endpoint; give it its own ceiling.
const transcriptLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many transcript updates, slow down', code: 'RATE_LIMITED' },
});

// ── routes ──────────────────────────────────────────────────────────────

// Token-authorised audio stream for the local dev storage driver (s3 playback bypasses the API).
router.get('/:id/recording/stream', meetingController.recordingStream);

router.use(authenticate, requireTenant);

// Static paths first so they are never captured by "/:id".
router.get('/capabilities', requirePermission('meetings.view'), meetingController.capabilities);
router.get('/members', requirePermission('meetings.view'), meetingController.members);
router.get('/action-items', requirePermission('meetings.view'), validateRequest(itemsQuery, 'query'), meetingController.allActionItems);

router.get('/', requirePermission('meetings.view'), validateRequest(listQuery, 'query'), meetingController.list);
router.post('/', requirePermission('meetings.create'), validateRequest(createSchema), meetingController.create);

router.get('/:id', requirePermission('meetings.view'), meetingController.get);
router.put('/:id', requirePermission('meetings.edit'), validateRequest(updateSchema), meetingController.update);
router.delete('/:id', requirePermission('meetings.delete'), validateRequest(deleteQuery, 'query'), meetingController.remove);

// lifecycle
router.post('/:id/start', requirePermission('meetings.edit'), meetingController.start);
router.post('/:id/end', requirePermission('meetings.edit'), validateRequest(endSchema), meetingController.end);
router.post('/:id/cancel', requirePermission('meetings.edit'), meetingController.cancel);

// recording
router.put('/:id/recording/chunks/:index', chunkLimiter, requirePermission('meetings.edit'), validateRequest(chunkParams, 'params'), rawAudio, meetingController.uploadChunk);
router.get('/:id/recording/url', requirePermission('meetings.view'), meetingController.recordingUrl);
router.post('/:id/transcribe-chunk', liveClipLimiter, requirePermission('meetings.edit'), validateRequest(offsetQuery, 'query'), rawAudio, meetingController.transcribeChunk);

// transcript
router.get('/:id/transcript', requirePermission('meetings.view'), validateRequest(transcriptQuery, 'query'), meetingController.listTranscript);
router.post('/:id/transcript', transcriptLimiter, requirePermission('meetings.edit'), validateRequest(appendSchema), meetingController.appendTranscript);
router.post('/:id/transcript/import', requirePermission('meetings.edit'), validateRequest(importSchema), meetingController.importTranscript);
router.patch('/:id/transcript/:seq', requirePermission('meetings.edit'), validateRequest(segmentParams, 'params'), validateRequest(segmentPatchSchema), meetingController.editSegment);
router.get('/:id/speakers', requirePermission('meetings.view'), meetingController.listSpeakers);
router.patch('/:id/speakers', requirePermission('meetings.edit'), validateRequest(speakerSchema), meetingController.renameSpeaker);

// AI
router.get('/:id/summary', requirePermission('meetings.view'), meetingController.getSummary);
router.post('/:id/generate-summary', requirePermission('meetings.edit'), meetingController.generateSummary);
router.get('/:id/minutes', requirePermission('meetings.view'), meetingController.getMinutes);
router.put('/:id/minutes', requirePermission('meetings.edit'), validateRequest(minutesSchema), meetingController.saveMinutes);
router.post('/:id/generate-minutes', requirePermission('meetings.edit'), meetingController.generateMinutes);
router.post('/:id/process', requirePermission('meetings.edit'), validateRequest(retrySchema), meetingController.retry);
router.post('/:id/ask', askLimiter, requirePermission('meetings.view'), validateRequest(askSchema), meetingController.ask);

// action items (+ push to LifeOS Tasks)
router.get('/:id/action-items', requirePermission('meetings.view'), meetingController.listActionItems);
router.post('/:id/action-items', requirePermission('meetings.edit'), validateRequest(actionCreateSchema), meetingController.createActionItem);
router.post('/:id/action-items/create-tasks', requirePermission('meetings.edit'), requirePermission('tasks.create'), meetingController.tasksFromItems);
router.patch('/:id/action-items/:itemId', requirePermission('meetings.edit'), validateRequest(actionPatchSchema), meetingController.updateActionItem);
router.delete('/:id/action-items/:itemId', requirePermission('meetings.edit'), meetingController.removeActionItem);
router.post('/:id/action-items/:itemId/task', requirePermission('meetings.edit'), requirePermission('tasks.create'), meetingController.taskFromItem);

// export & sharing
router.get('/:id/export', requirePermission('meetings.view'), validateRequest(exportQuery, 'query'), meetingController.exportMeeting);
router.get('/:id/share', requirePermission('meetings.view'), meetingController.getShare);
router.post('/:id/share', requirePermission('meetings.edit'), validateRequest(shareSchema), meetingController.createShare);
router.delete('/:id/share', requirePermission('meetings.edit'), meetingController.revokeShare);

export default router;
