import mongoose from 'mongoose';

const { Schema } = mongoose;

/** A report about a person or one of their messages. Kept for an administrator to review; the reporter is never shown to the reported person. */
const reportSchema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    conversationId: { type: Schema.Types.ObjectId },
    messageId: { type: Schema.Types.ObjectId },
    messageKind: { type: String },
    messageText: { type: String, maxlength: 1000 }, // copy at the time of the report, so editing or deleting it later does not erase the evidence
    reason: { type: String, enum: ['spam', 'harassment', 'inappropriate', 'impersonation', 'other'], required: true },
    details: { type: String, maxlength: 500, default: '' },
    status: { type: String, enum: ['open', 'reviewed', 'dismissed'], default: 'open' },
  },
  { timestamps: true }
);
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reporterId: 1, createdAt: -1 });

export default mongoose.model('ConnectReport', reportSchema);
