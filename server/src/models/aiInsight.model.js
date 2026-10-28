import mongoose from 'mongoose';

/**
 * Cache of AI-written sentences so each briefing/review is generated at most once
 * (keeps AI cost predictable). `key` is the day ('YYYY-MM-DD') or week start.
 */
const aiInsightSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['morning', 'evening', 'weekly'], required: true },
    key: { type: String, required: true },
    text: { type: String, required: true, maxlength: 1000 },
  },
  { timestamps: true }
);

aiInsightSchema.index({ userId: 1, kind: 1, key: 1 }, { unique: true });
// Old cache entries are not needed after 60 days.
aiInsightSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 3600 });

export default mongoose.model('AiInsight', aiInsightSchema);
