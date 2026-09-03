import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String },
    priority: {
      type: String,
      enum: ['urgent', 'high', 'medium', 'low'],
      default: 'medium',
    },
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed', 'cancelled', 'postponed'],
      default: 'not_started',
    },
    category: { type: String },
    dueDate: { type: Date },
    estimatedMinutes: { type: Number },
    actualMinutes: { type: Number },
    recurrenceType: {
      type: String,
      enum: ['none', 'daily', 'weekly', 'monthly'],
      default: 'none',
    },
    subtasks: [
      {
        title: { type: String, trim: true },
        isDone: { type: Boolean, default: false },
      },
    ],
    notes: { type: String },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

taskSchema.index({ tenantId: 1, createdAt: -1 });
taskSchema.index({ tenantId: 1, dueDate: 1 });
taskSchema.index({ tenantId: 1, status: 1 });
taskSchema.index({ tenantId: 1, createdBy: 1 });
taskSchema.index({ tenantId: 1, completedAt: -1 }); // analytics: completedAt ranges + productivity counts

export default mongoose.model('Task', taskSchema);
