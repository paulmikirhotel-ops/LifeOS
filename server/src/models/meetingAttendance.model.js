import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * MeetingAttendance — one row per person per meeting.
 *
 * This is the join/participation record the invitation flow produces. It is
 * deliberately SEPARATE from `Meeting.participants`:
 *
 *   • `Meeting.participants` is the organizer's *invitation list* — people the
 *     organizer deliberately added. It drives notifications and is editable.
 *   • `MeetingAttendance` is the *observation log* — who actually responded,
 *     joined, when, and from where. It is written by the join flow, not by the
 *     organizer, and it survives participant-list edits.
 *
 * Both exist because the product needs both (see requirement 5: participant
 * management and shared-link distribution are different concepts that must work
 * together).
 *
 * DUPLICATE PREVENTION
 * A unique partial index on (meetingId, userId) guarantees one row per signed-in
 * user per meeting even if they join five times — repeat joins UPDATE the row
 * (joinCount++, lastSeenAt) instead of inserting. Guests are keyed by a hashed
 * per-device `guestKey` instead, which is why the constraint is expressed as two
 * partial indexes rather than one sparse compound index (a sparse compound index
 * would still index guest rows that lack userId, and would then reject them all).
 */

export const ATTENDANCE_ROLES = ['organizer', 'chair', 'attendee', 'guest'];
export const JOIN_METHODS = ['link', 'direct', 'organizer'];

/** Lifecycle of a person's involvement in one meeting. */
export const ATTENDANCE_STATES = [
  'invited', // invited directly, has not responded
  'requested', // asked to join via a link, awaiting organizer approval
  'approved', // allowed in, has not joined the room yet
  'declined', // said no, or the organizer declined the request
  'attended', // joined (at least once)
  'no_show', // never joined
  'removed', // organizer removed them
];

export const RESPONSE_STATES = ['pending', 'accepted', 'declined', 'tentative'];

const meetingAttendanceSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true, index: true },

    // Exactly one of userId / guestKey identifies the person.
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // SHA-256 of a random token the guest's browser stores. Never the raw value,
    // and never used for anything except de-duplicating the same guest device.
    guestKey: { type: String, default: null, select: false },

    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },

    role: { type: String, enum: ATTENDANCE_ROLES, default: 'attendee' },
    joinMethod: { type: String, enum: JOIN_METHODS, default: 'link' },

    attendance: { type: String, enum: ATTENDANCE_STATES, default: 'invited' },
    response: { type: String, enum: RESPONSE_STATES, default: 'pending' },
    respondedAt: { type: Date },

    firstJoinedAt: { type: Date },
    lastJoinedAt: { type: Date },
    leftAt: { type: Date },
    lastSeenAt: { type: Date },
    /** Repeat joins update the same row; this counts them. */
    joinCount: { type: Number, default: 0, min: 0 },
    /** Total seconds present, accumulated across join/leave cycles. */
    attendedSec: { type: Number, default: 0, min: 0 },

    /** Whether this person may see the participant list and shared content. */
    canViewParticipants: { type: Boolean, default: true },

    addedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    /** Set when a guest converted to a real account, linking the two rows. */
    claimedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// One row per signed-in user per meeting.
meetingAttendanceSchema.index(
  { meetingId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } }
);
// One row per guest device per meeting.
meetingAttendanceSchema.index(
  { meetingId: 1, guestKey: 1 },
  { unique: true, partialFilterExpression: { guestKey: { $type: 'string' } } }
);
meetingAttendanceSchema.index({ tenantId: 1, meetingId: 1, attendance: 1 });
meetingAttendanceSchema.index({ tenantId: 1, meetingId: 1, createdAt: 1 });
// Powers "Meetings I was invited to / attended" in the user's history.
meetingAttendanceSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });

export default mongoose.model('MeetingAttendance', meetingAttendanceSchema);
