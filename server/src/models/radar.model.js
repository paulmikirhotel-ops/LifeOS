import mongoose from 'mongoose';

const sourceSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    url: { type: String, required: true, maxlength: 500 },
    // 'auto' = guess each item's type from keywords; otherwise the user's choice applies to every item
    type: { type: String, enum: ['auto', 'job', 'scholarship', 'grant', 'other'], default: 'auto' },
    lastFetchedAt: { type: Date },
    lastError: { type: String, default: '' },
    itemCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);
sourceSchema.index({ tenantId: 1, userId: 1, url: 1 }, { unique: true });

const itemSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'RadarSource', required: true },
    sourceName: { type: String, default: '' },
    hash: { type: String, required: true },
    title: { type: String, required: true, maxlength: 200 },
    link: { type: String, required: true, maxlength: 1000 },
    domain: { type: String, default: '' },
    summary: { type: String, default: '', maxlength: 500 },
    publishedAt: { type: Date },
    deadline: { type: Date },
    type: { type: String, enum: ['job', 'scholarship', 'grant', 'other'], default: 'other' },
    typeGuessed: { type: Boolean, default: true },
    fetchedAt: { type: Date, default: Date.now },
    // the person's own decision: new | saved | dismissed
    state: { type: String, enum: ['new', 'saved', 'dismissed'], default: 'new' },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    why: { type: String, default: '', maxlength: 300 }, // optional AI explanation of the match
  },
  { timestamps: true }
);
itemSchema.index({ sourceId: 1, hash: 1 }, { unique: true });
itemSchema.index({ tenantId: 1, userId: 1, state: 1 });

const profileSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    keywords: [{ type: String, maxlength: 40 }],
  },
  { timestamps: true }
);
profileSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

const usageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  day: { type: String, required: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});
usageSchema.index({ userId: 1, day: 1 }, { unique: true });
usageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RadarSource = mongoose.models.RadarSource || mongoose.model('RadarSource', sourceSchema);
export const RadarItem = mongoose.models.RadarItem || mongoose.model('RadarItem', itemSchema);
export const RadarProfile = mongoose.models.RadarProfile || mongoose.model('RadarProfile', profileSchema);
export const RadarUsage = mongoose.models.RadarUsage || mongoose.model('RadarUsage', usageSchema);
