import mongoose from 'mongoose';

const { Schema } = mongoose;
const oid = { type: Schema.Types.ObjectId };

/** Optional public profile. Off by default; nothing is listed until the person switches it on. Never holds contact details. */
const profileSchema = new Schema(
  {
    userId: { ...oid, ref: 'User', required: true, unique: true },
    enabled: { type: Boolean, default: false },
    displayName: { type: String, trim: true, maxlength: 40, default: '' },
    intro: { type: String, maxlength: 300, default: '' },
    offers: { type: [String], default: [] },
    wants: { type: [String], default: [] },
    language: { type: String, maxlength: 40, default: '' },
    availability: { type: String, maxlength: 80, default: '' },
    audience: { type: String, enum: ['friends', 'everyone'], default: 'friends' },
    hidden: { type: Boolean, default: false }, // hidden after repeated reports, until an admin reviews
  },
  { timestamps: true }
);
profileSchema.index({ enabled: 1, hidden: 1, audience: 1 });

const groupSchema = new Schema(
  {
    ownerId: { ...oid, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    topic: { type: String, maxlength: 60, default: '' },
    description: { type: String, maxlength: 400, default: '' },
    language: { type: String, maxlength: 40, default: '' },
    audience: { type: String, enum: ['friends', 'everyone'], default: 'friends' },
    maxMembers: { type: Number, default: 12, min: 2, max: 50 },
    nextSessionAt: { type: Date },
    members: { type: [Schema.Types.ObjectId], default: [] }, // includes the owner
    conversationId: { ...oid, ref: 'ConnectConversation' }, // the Connect group chat used by this group
    status: { type: String, enum: ['open', 'closed', 'hidden'], default: 'open' },
  },
  { timestamps: true }
);
groupSchema.index({ status: 1, createdAt: -1 });
groupSchema.index({ members: 1 });
groupSchema.index({ ownerId: 1, createdAt: -1 });

const requestSchema = new Schema(
  {
    kind: { type: String, enum: ['mentor', 'group'], required: true },
    fromId: { ...oid, ref: 'User', required: true },
    toId: { ...oid, ref: 'User', required: true }, // the mentor, or the group owner
    groupId: { ...oid, ref: 'StudyGroup' },
    message: { type: String, maxlength: 200, default: '' },
    status: { type: String, enum: ['pending', 'accepted', 'declined', 'cancelled'], default: 'pending' },
    respondedAt: { type: Date },
  },
  { timestamps: true }
);
requestSchema.index({ toId: 1, status: 1, createdAt: -1 });
requestSchema.index({ fromId: 1, status: 1, createdAt: -1 });
// one open request per person per target
requestSchema.index({ fromId: 1, toId: 1, kind: 1, groupId: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });

const reportSchema = new Schema(
  {
    reporterId: { ...oid, ref: 'User', required: true },
    targetType: { type: String, enum: ['profile', 'group', 'listing'], required: true },
    targetUserId: { ...oid, ref: 'User', required: true },
    groupId: { ...oid }, // the group id, or the Impact listing id when targetType is 'listing'
    reason: { type: String, enum: ['spam', 'impersonation', 'asks_for_money', 'harassment', 'inappropriate', 'other'], required: true },
    details: { type: String, maxlength: 500, default: '' },
    // copy at report time so later edits do not erase the evidence
    snapshot: { type: String, maxlength: 600, default: '' },
    status: { type: String, enum: ['open', 'reviewed', 'dismissed'], default: 'open' },
  },
  { timestamps: true }
);
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reporterId: 1, createdAt: -1 });
reportSchema.index({ reporterId: 1, targetType: 1, targetUserId: 1, groupId: 1 }, { unique: true });

export const CommunityProfile = mongoose.models.CommunityProfile || mongoose.model('CommunityProfile', profileSchema);
export const StudyGroup = mongoose.models.StudyGroup || mongoose.model('StudyGroup', groupSchema);
export const CommunityRequest = mongoose.models.CommunityRequest || mongoose.model('CommunityRequest', requestSchema);
export const CommunityReport = mongoose.models.CommunityReport || mongoose.model('CommunityReport', reportSchema);
