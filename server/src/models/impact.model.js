import mongoose from 'mongoose';

const { Schema } = mongoose;

/** A volunteering / tutoring / digital-skills / project listing posted by one person. Free help only. */
const listingSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, enum: ['volunteering', 'tutoring', 'digital_skills', 'project'], required: true },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, maxlength: 500 },
    skills: { type: [String], default: [] },
    location: { type: String, maxlength: 80, default: '' }, // a town or "Online", never a street address
    mode: { type: String, enum: ['online', 'in_person', 'both'], default: 'online' },
    spots: { type: Number, default: 5, min: 1, max: 100 },
    accepted: { type: [Schema.Types.ObjectId], default: [] },
    startsAt: { type: Date },
    orgName: { type: String, maxlength: 80, default: '' }, // free text typed by the poster, NOT verified
    verified: { type: Boolean, default: false }, // set only by a platform admin after a review
    audience: { type: String, enum: ['friends', 'everyone'], default: 'friends' },
    status: { type: String, enum: ['open', 'closed', 'hidden'], default: 'open' },
  },
  { timestamps: true }
);
listingSchema.index({ status: 1, category: 1, createdAt: -1 });
listingSchema.index({ ownerId: 1, createdAt: -1 });

const interestSchema = new Schema(
  {
    listingId: { type: Schema.Types.ObjectId, ref: 'ImpactListing', required: true },
    fromId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, maxlength: 200, default: '' },
    status: { type: String, enum: ['pending', 'accepted', 'declined', 'cancelled'], default: 'pending' },
    respondedAt: { type: Date },
  },
  { timestamps: true }
);
interestSchema.index({ toId: 1, status: 1, createdAt: -1 });
interestSchema.index({ fromId: 1, createdAt: -1 });
interestSchema.index({ listingId: 1, fromId: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });

/** The person's own volunteering diary. Private unless they tick "share" on an entry. */
const logSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, maxlength: 100 },
    hours: { type: Number, required: true, min: 0.25, max: 24 },
    date: { type: Date, required: true },
    note: { type: String, maxlength: 200, default: '' },
    listingId: { type: Schema.Types.ObjectId },
    shared: { type: Boolean, default: false }, // consent: only shared entries count on the person's community profile
  },
  { timestamps: true }
);
logSchema.index({ userId: 1, date: -1 });
logSchema.index({ userId: 1, shared: 1 });

export const ImpactListing = mongoose.models.ImpactListing || mongoose.model('ImpactListing', listingSchema);
export const ImpactInterest = mongoose.models.ImpactInterest || mongoose.model('ImpactInterest', interestSchema);
export const VolunteerLog = mongoose.models.VolunteerLog || mongoose.model('VolunteerLog', logSchema);
