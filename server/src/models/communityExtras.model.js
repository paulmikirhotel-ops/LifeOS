import mongoose from 'mongoose';

const { Schema } = mongoose;
const oid = { type: Schema.Types.ObjectId };

/** A useful link shared under the person's Community name. Never holds contact details. */
const resourceSchema = new Schema(
  {
    ownerId: { ...oid, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    url: { type: String, required: true, maxlength: 300 },
    domain: { type: String, required: true, maxlength: 120 },
    skill: { type: String, required: true, maxlength: 40 },
    note: { type: String, maxlength: 200, default: '' },
    status: { type: String, enum: ['open', 'hidden'], default: 'open' }, // hidden after repeated reports, until an admin looks
  },
  { timestamps: true }
);
resourceSchema.index({ status: 1, createdAt: -1 });
resourceSchema.index({ ownerId: 1, createdAt: -1 });
resourceSchema.index({ ownerId: 1, url: 1 }, { unique: true });

const resourceReportSchema = new Schema(
  {
    reporterId: { ...oid, ref: 'User', required: true },
    resourceId: { ...oid, ref: 'LearningResource', required: true },
    ownerId: { ...oid, ref: 'User', required: true },
    reason: { type: String, required: true },
    details: { type: String, maxlength: 500, default: '' },
    snapshot: { type: String, maxlength: 600, default: '' }, // copy at report time, so later edits do not erase the evidence
    status: { type: String, enum: ['open', 'reviewed', 'dismissed'], default: 'open' },
  },
  { timestamps: true }
);
resourceReportSchema.index({ status: 1, createdAt: -1 });
resourceReportSchema.index({ reporterId: 1, resourceId: 1 }, { unique: true });

/** A time two people agreed (or are agreeing) to meet. Stored once, in UTC. */
const sessionSchema = new Schema(
  {
    proposerId: { ...oid, ref: 'User', required: true },
    otherId: { ...oid, ref: 'User', required: true }, // the person who has to answer
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    minutes: { type: Number, required: true },
    note: { type: String, maxlength: 200, default: '' },
    status: { type: String, enum: ['proposed', 'accepted', 'declined', 'cancelled', 'countered'], default: 'proposed' },
    counterOf: { ...oid },
    reminderSent: { type: Boolean, default: false },
    calendar: { type: [{ userId: oid, eventId: oid }], default: [] },
    respondedAt: { type: Date },
  },
  { timestamps: true }
);
sessionSchema.index({ proposerId: 1, startsAt: 1 });
sessionSchema.index({ otherId: 1, startsAt: 1 });
sessionSchema.index({ status: 1, startsAt: 1, reminderSent: 1 });

export const LearningResource = mongoose.models.LearningResource || mongoose.model('LearningResource', resourceSchema);
export const ResourceReport = mongoose.models.ResourceReport || mongoose.model('ResourceReport', resourceReportSchema);
export const MentorSession = mongoose.models.MentorSession || mongoose.model('MentorSession', sessionSchema);
