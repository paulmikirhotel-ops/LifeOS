import mongoose from 'mongoose';

const { Schema } = mongoose;

export const PARTICIPANT_ROLES = ['chair', 'attendee', 'guest'];
export const JOIN_METHODS = ['organizer', 'invited', 'link'];
export const PARTICIPANT_STATUSES = ['registered', 'joined', 'left', 'absent'];
export const PARTICIPANT_RESPONSES = ['pending', 'accepted', 'tentative', 'declined'];

/**
 * One row per person per meeting (join / attendance record).
 *
 * `key` makes it duplicate-proof: a signed-in user is always `u:<userId>` (joining twice
 * updates the same row), a guest gets a random `g:<id>` so two guests with the same name
 * never collide. A unique index on (meetingId, key) enforces it even under races.
 * This collection NEVER grants access to workspace data: workspace access still comes from
 * Meeting.participants / membership, so link joiners from outside a workspace see nothing else.
 */
const meetingParticipantSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true },
    key: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    // Optional, given by a guest who wants the minutes e-mailed to them.
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    displayName: { type: String, required: true, trim: true, maxlength: 120 },
    isGuest: { type: Boolean, default: false },
    role: { type: String, enum: PARTICIPANT_ROLES, default: 'attendee' },
    joinMethod: { type: String, enum: JOIN_METHODS, default: 'link' },
    response: { type: String, enum: PARTICIPANT_RESPONSES, default: 'accepted' },
    status: { type: String, enum: PARTICIPANT_STATUSES, default: 'registered' },
    // Set when the person actually enters the room (meeting-room phase).
    joinedAt: { type: Date },
    leftAt: { type: Date },
    lastSeenAt: { type: Date },
    // Link version they joined with: regenerating the link invalidates it (no password-free return, no notifications).
    inviteVersion: { type: Number },
    // Where their notifications live: their own workspace (signed-in people only).
    notifyTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
  },
  { timestamps: true }
);

meetingParticipantSchema.index({ meetingId: 1, key: 1 }, { unique: true });
meetingParticipantSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
meetingParticipantSchema.index({ meetingId: 1, createdAt: 1 });

export default mongoose.model('MeetingParticipant', meetingParticipantSchema);
