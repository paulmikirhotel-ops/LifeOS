import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 140 },
  kind: { type: String, enum: ['task', 'event'], default: 'task' },
  priority: { type: String, enum: ['urgent', 'high', 'medium', 'low'], default: 'medium' },
  estimatedMinutes: { type: Number, default: 45 },
  durationMinutes: { type: Number },
  dueDate: { type: Date },
  startAt: { type: Date },
  approved: { type: Boolean, default: false },
  // draft = only in the roadmap; created = a real Task/CalendarEvent exists; done; skipped = removed or deleted elsewhere
  state: { type: String, enum: ['draft', 'created', 'done', 'skipped'], default: 'draft' },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'CalendarEvent' },
  completedAt: { type: Date },
});

const phaseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 100 },
  weeksLabel: { type: String, default: '' },
  items: [itemSchema],
});

const nextStepPlanSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    goalText: { type: String, required: true, maxlength: 1000 },
    title: { type: String, required: true, maxlength: 120 },
    summary: { type: String, default: '' },
    targetDate: { type: Date },
    hoursPerWeek: { type: Number, default: 5 },
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft' },
    goalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Goal' },
    revision: { type: Number, default: 0 },
    skipStreak: { type: Number, default: 0 },
    phases: [phaseSchema],
  },
  { timestamps: true }
);

nextStepPlanSchema.index({ tenantId: 1, userId: 1, status: 1, updatedAt: -1 });

export const NextStepPlan = mongoose.model('NextStepPlan', nextStepPlanSchema);

/** One row per user per UTC day: how many AI calls NextStep has used. Rows expire after 3 days. */
const usageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  day: { type: String, required: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});
usageSchema.index({ userId: 1, day: 1 }, { unique: true });

export const NextStepUsage = mongoose.model('NextStepUsage', usageSchema);
