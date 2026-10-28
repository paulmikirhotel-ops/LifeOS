import mongoose from 'mongoose';

const base = {
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
};

const areaSchema = new mongoose.Schema({ ...base, name: { type: String, required: true, trim: true, maxlength: 40 }, targetMinutes: { type: Number, default: 0, min: 0 },
  taskCategories: [{ type: String, maxlength: 40 }], // finished tasks with these categories add time to this area
  eventTypes: [{ type: String, enum: ['work', 'school', 'meeting', 'study', 'exercise', 'personal', 'appointment', 'other'] }], // ended calendar events of these types add time
}, { timestamps: true });
areaSchema.index({ tenantId: 1, userId: 1, name: 1 });

const logSchema = new mongoose.Schema({
  ...base,
  areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'LifeArea', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  minutes: { type: Number, required: true, min: 1, max: 1440 },
  note: { type: String, default: '', maxlength: 200 },
}, { timestamps: true });
logSchema.index({ tenantId: 1, userId: 1, date: 1 });
logSchema.index({ areaId: 1 });

const entrySchema = new mongoose.Schema({
  ...base,
  kind: { type: String, enum: ['note', 'link', 'lesson'], required: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  body: { type: String, default: '', maxlength: 5000 },
  url: { type: String, default: '', maxlength: 500 },
  tags: [{ type: String, maxlength: 30 }],
  pinned: { type: Boolean, default: false },
  search: { type: String, default: '' }, // lowercase text used for searching
}, { timestamps: true });
entrySchema.index({ tenantId: 1, userId: 1, pinned: -1, updatedAt: -1 });
entrySchema.index({ tenantId: 1, userId: 1, tags: 1 });

const metaSchema = new mongoose.Schema({
  ...base,
  lastBackupAt: { type: Date },
  reminder: { type: Boolean, default: false },
  restoreDay: { type: String, default: '' },
  restoresToday: { type: Number, default: 0 },
}, { timestamps: true });
metaSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

export const LifeArea = mongoose.models.LifeArea || mongoose.model('LifeArea', areaSchema);
export const BalanceLog = mongoose.models.BalanceLog || mongoose.model('BalanceLog', logSchema);
export const KnowledgeEntry = mongoose.models.KnowledgeEntry || mongoose.model('KnowledgeEntry', entrySchema);
export const BackupMeta = mongoose.models.BackupMeta || mongoose.model('BackupMeta', metaSchema);
