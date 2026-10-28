import mongoose from 'mongoose';

/**
 * Saved weekly review (one per user per week). `weekStart` is the Monday as 'YYYY-MM-DD'.
 * Only completed weeks are stored; the current week is always computed live.
 */
const weeklyReportSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    weekStart: { type: String, required: true },
    weekEnd: { type: String, required: true },
    score: { type: Number, default: 0 },
    stats: { type: mongoose.Schema.Types.Mixed, default: {} },
    insights: [{ type: String }],
  },
  { timestamps: true }
);

weeklyReportSchema.index({ tenantId: 1, userId: 1, weekStart: 1 }, { unique: true });

export default mongoose.model('WeeklyReport', weeklyReportSchema);
