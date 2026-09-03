import mongoose from 'mongoose';

const goalSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    type: {
      type: String,
      enum: ['short_term', 'long_term'],
      default: 'short_term',
    },
    targetDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled'],
      default: 'active',
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    milestones: [
      {
        title: {
          type: String,
          required: true,
        },
        isDone: {
          type: Boolean,
          default: false,
        },
        dueDate: {
          type: Date,
        },
      },
    ],
    relatedTaskIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task',
      },
    ],
  },
  { timestamps: true }
);

goalSchema.index({ tenantId: 1, createdAt: -1 });
goalSchema.index({ tenantId: 1, status: 1 });

const Goal = mongoose.model('Goal', goalSchema);

export default Goal;
