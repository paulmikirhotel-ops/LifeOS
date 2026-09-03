import mongoose from 'mongoose';

const scheduleBlockSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    category: {
      type: String,
      enum: ['work', 'study', 'meeting', 'exercise', 'personal', 'other'],
      default: 'work',
    },
    date: { type: String, required: true }, // 'YYYY-MM-DD'
    startMin: { type: Number, required: true, min: 0, max: 1439 },
    endMin: { type: Number, required: true, min: 1, max: 1440 },
    notes: { type: String },
  },
  { timestamps: true }
);

scheduleBlockSchema.index({ tenantId: 1, date: 1 });
scheduleBlockSchema.index({ tenantId: 1, userId: 1, date: 1 });

export default mongoose.model('ScheduleBlock', scheduleBlockSchema);
