import mongoose from 'mongoose';
import { INVITE_ACCESS_MODES } from '../utils/invite.js';

const { Schema } = mongoose;

export const MEETING_TYPES = [
  'team',
  'business',
  'class',
  'project',
  'interview',
  'community',
  'personal',
  'other',
];
export const MEETING_STATUSES = ['scheduled', 'live', 'completed', 'cancelled'];
export const RECURRENCE_FREQUENCIES = ['none', 'daily', 'weekly', 'monthly', 'custom'];
export const PIPELINE_STATES = ['idle', 'pending', 'processing', 'done', 'failed'];

const participantSchema = new Schema(
  {
    // Set only when the participant is an active member of the workspace.
    // Membership is verified server-side before this is stored.
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    role: { type: String, enum: ['chair', 'attendee'], default: 'attendee' },
  },
  { _id: true }
);

const meetingSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    organizerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 5000 },
    type: { type: String, enum: MEETING_TYPES, default: 'team' },
    agenda: { type: String, maxlength: 10000 },
    // Physical location or meeting link. Stored as text; never fetched server-side.
    location: { type: String, trim: true, maxlength: 500 },

    timezone: { type: String, default: 'UTC', maxlength: 64 },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },

    status: { type: String, enum: MEETING_STATUSES, default: 'scheduled' },
    startedAt: { type: Date },
    endedAt: { type: Date },
    durationSec: { type: Number, min: 0 },

    // Recurrence rule is stored now; occurrence expansion is a Phase 4 concern.
    recurrence: {
      frequency: { type: String, enum: RECURRENCE_FREQUENCIES, default: 'none' },
      interval: { type: Number, min: 1, max: 365, default: 1 },
      daysOfWeek: { type: [Number], default: [] }, // 0=Sun … 6=Sat
      until: { type: Date },
    },

    // Minutes before start (e.g. 1440, 60, 30, 15 or custom).
    reminders: { type: [Number], default: [15] },

    participants: { type: [participantSchema], default: [] },

    // Linked LifeOS calendar entry (kept in sync by MeetingService).
    calendarEventId: { type: Schema.Types.ObjectId, ref: 'CalendarEvent' },

    // Recording metadata. Audio bytes live in object storage, never in MongoDB.
    recording: {
      status: {
        type: String,
        enum: ['none', 'recording', 'uploading', 'ready', 'failed'],
        default: 'none',
      },
      storageKey: { type: String },
      mimeType: { type: String },
      chunkCount: { type: Number, default: 0 },
      sizeBytes: { type: Number, default: 0 },
      durationSec: { type: Number },
      seen: { type: [Number], default: [], select: false }, // chunk indexes received (idempotent uploads)
      missingChunks: { type: Number, default: 0 },
      // Hand-off recording: who is recording right now, and how many recording segments were started.
      // Segment 0 is the original single-recorder flow; claims start at segment 1.
      segmentCount: { type: Number, default: 0 },
      activeRecorder: {
        key: { type: String, maxlength: 80 }, // u:<userId> or g:<random>: link joiners can record too
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        name: { type: String, maxlength: 120 },
        segment: { type: Number },
        heartbeatAt: { type: Date },
        paused: { type: Boolean, default: false },
      },
    },

    // Independent pipeline stages so one failure never blocks the others
    // and the recording is never affected by an AI failure.
    processing: {
      transcript: { type: String, enum: PIPELINE_STATES, default: 'idle' },
      summary: { type: String, enum: PIPELINE_STATES, default: 'idle' },
      minutes: { type: String, enum: PIPELINE_STATES, default: 'idle' },
      actionItems: { type: String, enum: PIPELINE_STATES, default: 'idle' },
      lastError: { type: String, maxlength: 500 },
    },

    summary: {
      executiveSummary: { type: String },
      keyPoints: { type: [String], default: undefined },
      decisions: { type: [String], default: undefined },
      questions: { type: [String], default: undefined },
      nextSteps: { type: [String], default: undefined },
      topics: { type: [String], default: undefined },
      generatedAt: { type: Date },
    },
    minutes: {
      content: { type: String },
      generatedAt: { type: Date },
      editedAt: { type: Date },
    },

    // Intermediate map-reduce output so minutes / regenerate never re-read the whole transcript.
    analysis: {
      notes: { type: Schema.Types.Mixed, select: false },
      segmentCount: { type: Number },
      generatedAt: { type: Date },
    },

    // Monotonic counter used to allocate transcript sequence numbers for live chunks.
    transcriptSeq: { type: Number, default: 0 },

    // Recurring meetings are materialised as independent instances sharing a seriesId.
    seriesId: { type: Schema.Types.ObjectId },

    // Explicit, revocable, read-only share link. Recording audio is never shared.
    share: {
      tokenHash: { type: String, select: false },
      expiresAt: { type: Date },
      includeTranscript: { type: Boolean, default: false },
      createdAt: { type: Date },
    },

    // Who may press Record. true = any participant (the organizer always can); false = organizer only.
    recordingPolicy: {
      anyone: { type: Boolean, default: true },
    },

    // Minutes for people who joined by link (read-only). The organizer can turn it off.
    minutesSharing: {
      enabled: { type: Boolean, default: true },
      sentAt: { type: Date },
      lastManualAt: { type: Date },
    },

    // Shareable invitation link (anyone with the link + password). The token itself is derived,
    // never stored; see utils/invite.js.
    invite: {
      tokenHash: { type: String, select: false },
      version: { type: Number, default: 1 },
      enabled: { type: Boolean, default: true },
      accessMode: { type: String, enum: INVITE_ACCESS_MODES, default: 'link' },
      passwordHash: { type: String, select: false },
      failedAttempts: { type: Number, default: 0 },
      lockedUntil: { type: Date },
      createdAt: { type: Date },
      regeneratedAt: { type: Date },
    },

    notes: { type: String, maxlength: 20000 },
  },
  { timestamps: true }
);

meetingSchema.index({ tenantId: 1, startAt: -1 });
meetingSchema.index({ tenantId: 1, status: 1, startAt: 1 });
meetingSchema.index({ tenantId: 1, organizerId: 1, startAt: -1 });
meetingSchema.index({ tenantId: 1, 'participants.userId': 1, startAt: -1 });
meetingSchema.index({ seriesId: 1 }, { sparse: true });
meetingSchema.index({ 'share.tokenHash': 1 }, { sparse: true });
meetingSchema.index({ 'invite.tokenHash': 1 }, { unique: true, sparse: true });

export default mongoose.model('Meeting', meetingSchema);
