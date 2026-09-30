import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ACTION_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];
export const ACTION_PRIORITIES = ['urgent', 'high', 'medium', 'low'];

const actionItemSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    task: { type: String, required: true, trim: true, maxlength: 300 },
    // Free-text name as heard/entered; assigneeUserId only when a workspace member.
    assigneeName: { type: String, trim: true, maxlength: 120 },
    assigneeUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    deadline: { type: Date },
    // Deadline exactly as spoken ("by Friday") when it couldn't be resolved to a date.
    deadlineText: { type: String, maxlength: 120 },
    // Same scale as the Tasks module so items map 1:1 when pushed to Tasks.
    priority: { type: String, enum: ACTION_PRIORITIES, default: 'medium' },
    status: { type: String, enum: ACTION_STATUSES, default: 'pending' },

    source: { type: String, enum: ['ai', 'manual'], default: 'manual' },
    // Transcript sequence the item was derived from (traceability, no invention).
    sourceSeq: { type: Number },
    // Set in Phase 9 when the item is pushed into the LifeOS Tasks module.
    taskId: { type: Schema.Types.ObjectId, ref: 'Task' },
  },
  { timestamps: true }
);

actionItemSchema.index({ tenantId: 1, meetingId: 1, createdAt: 1 });
actionItemSchema.index({ tenantId: 1, assigneeUserId: 1, status: 1 });

export default mongoose.model('ActionItem', actionItemSchema);
