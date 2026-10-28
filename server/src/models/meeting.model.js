import mongoose from 'mongoose';

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

/**
 * Who may open the meeting through its invitation link.
 *   public        — anyone with the link.
 *   authenticated — must be signed in to LifeOS.
 *   restricted    — must have been invited directly (by the organizer) or approved.
 */
export const ACCESS_MODES = ['public', 'authenticated', 'restricted'];

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

    /**
     * How people may reach this meeting through its invitation link.
     * Defaults keep existing meetings private to signed-in LifeOS users.
     */
    access: {
      mode: { type: String, enum: ACCESS_MODES, default: 'authenticated' },
      /** Let people without a LifeOS account join by typing their name. */
      allowGuests: { type: Boolean, default: false },
      /** Joiners land in a "waiting for approval" state instead of joining. */
      requireApproval: { type: Boolean, default: false },
      /** Whether link visitors may see who else is coming. */
      showParticipants: { type: Boolean, default: true },
      /** Optional external room (Zoom/Meet/Teams…). When set, JOIN opens it. */
      externalUrl: { type: String, trim: true, maxlength: 1000 },
    },

    /**
     * The shareable invitation link.
     *
     * `code` is 72 bits of cryptographic randomness in base64url (~12 chars) —
     * NOT the Mongo _id. Requirement 22 asks explicitly that the link not expose
     * a predictable id, so the link never reveals the document id, and
     * regenerating replaces the code, instantly invalidating the old link.
     *
     * The raw code IS the secret (it is the bearer token for the link), so it is
     * stored directly — unlike the post-meeting `share` token, whose hash is all
     * that is kept. Hashing this one would make the organizer unable to re-read
     * their own link, which the product requires ("show the link + Copy button").
     */
    invite: {
      // Indexed via the explicit partial unique index below, not `index: true`.
      code: { type: String },
      version: { type: Number, default: 0 },
      createdAt: { type: Date },
      regeneratedAt: { type: Date },
      revokedAt: { type: Date },
      /** Optional hard expiry. Null = the link lives as long as the meeting. */
      expiresAt: { type: Date, default: null },
    },

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
// Invitation codes must be globally unique. Partial (not sparse) so meetings
// created before this field existed are not swept into the constraint.
meetingSchema.index(
  { 'invite.code': 1 },
  { unique: true, partialFilterExpression: { 'invite.code': { $type: 'string' } } }
);

export default mongoose.model('Meeting', meetingSchema);
