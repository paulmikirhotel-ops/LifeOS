import mongoose from 'mongoose';

const focusSessionSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
    },
    type: {
      type: String,
      enum: ['focus', 'short_break', 'long_break'],
      default: 'focus',
    },
    plannedMinutes: {
      type: Number,
      required: true,
      min: 1,
      max: 180,
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endedAt: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['running', 'paused', 'completed', 'abandoned'],
      default: 'running',
    },
    pausedMs: {
      type: Number,
      default: 0,
    },
    pausedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

focusSessionSchema.index({ tenantId: 1, startedAt: 1 });
focusSessionSchema.index({ tenantId: 1, userId: 1, startedAt: 1 });
focusSessionSchema.index({ tenantId: 1, userId: 1, status: 1, endedAt: 1 }); // analytics: completed-session ranges

const FocusSession = mongoose.model('FocusSession', focusSessionSchema);

export default FocusSession;
