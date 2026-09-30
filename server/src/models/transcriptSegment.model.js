import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * One utterance of a meeting transcript.
 * (meetingId, seq) is unique so client retries (flaky network, Render restarts)
 * are idempotent: re-sending a segment overwrites it instead of duplicating it.
 */
const transcriptSegmentSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true },
    seq: { type: Number, required: true, min: 0 },

    // Diarization label from the STT provider ("Speaker 1"). This is NOT a
    // verified identity; speakerName is a user-assigned display name.
    speakerLabel: { type: String, default: 'Speaker 1', maxlength: 60 },
    speakerName: { type: String, maxlength: 120 },

    text: { type: String, required: true, maxlength: 5000 },
    startMs: { type: Number, required: true, min: 0 },
    endMs: { type: Number, min: 0 },
    confidence: { type: Number, min: 0, max: 1 },

    source: { type: String, enum: ['live', 'batch', 'manual'], default: 'live' },
    edited: { type: Boolean, default: false },
  },
  { timestamps: true }
);

transcriptSegmentSchema.index({ meetingId: 1, seq: 1 }, { unique: true });
transcriptSegmentSchema.index({ tenantId: 1, meetingId: 1, startMs: 1 });
transcriptSegmentSchema.index({ tenantId: 1, text: 'text' });

export default mongoose.model('TranscriptSegment', transcriptSegmentSchema);
