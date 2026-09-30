import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Durable background job (Mongo-backed queue).
 * Render can restart the API at any time, so work is persisted and resumed
 * instead of living in memory. See services/job.service.js.
 */
const jobSchema = new Schema(
  {
    type: { type: String, required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true },
    status: { type: String, enum: ['queued', 'running', 'done', 'failed'], default: 'queued' },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    runAt: { type: Date, default: Date.now },
    lockedAt: { type: Date },
    lastError: { type: String, maxlength: 1000 },
    payload: { type: Schema.Types.Mixed, default: {} },
    // Finished jobs are removed automatically after 14 days.
    finishedAt: { type: Date, expires: 14 * 24 * 3600 },
  },
  { timestamps: true }
);

jobSchema.index({ status: 1, runAt: 1 });
jobSchema.index({ meetingId: 1, type: 1, status: 1 });

export default mongoose.model('Job', jobSchema);
