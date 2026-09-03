import mongoose from 'mongoose';

const timeEntrySchema = new mongoose.Schema(
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
    activityType: {
      type: String,
      enum: ['work', 'study', 'meeting', 'personal', 'other'],
      default: 'work',
    },
    description: {
      type: String,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
    },
    startedAt: {
      type: Date,
      required: true,
    },
    endedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

timeEntrySchema.index({ tenantId: 1, startedAt: 1 });
timeEntrySchema.index({ tenantId: 1, userId: 1, startedAt: 1 });
timeEntrySchema.index({ tenantId: 1, userId: 1, endedAt: 1 }); // analytics: ended sessions in range

const TimeEntry = mongoose.model('TimeEntry', timeEntrySchema);

export default TimeEntry;
