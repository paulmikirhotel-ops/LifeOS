import mongoose from 'mongoose';

const { Schema } = mongoose;

const participantSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    state: { type: String, enum: ['joined', 'left'], default: 'joined' },
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * One voice or video call inside a Connect conversation. The media itself runs on the same LiveKit
 * service as meeting rooms; this row only records who was rung, who answered and how it ended.
 * status: ringing -> active (someone else answered) -> ended.
 */
const callSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'ConnectConversation', required: true },
    callerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    mode: { type: String, enum: ['voice', 'video'], default: 'voice' },
    status: { type: String, enum: ['ringing', 'active', 'ended'], default: 'ringing' },
    endReason: { type: String, enum: ['completed', 'declined', 'missed', 'cancelled'] },
    invited: { type: [Schema.Types.ObjectId], default: [] },
    declined: { type: [Schema.Types.ObjectId], default: [] },
    participants: { type: [participantSchema], default: [] },
    startedAt: { type: Date },
    endedAt: { type: Date },
  },
  { timestamps: true }
);

callSchema.index({ conversationId: 1, status: 1 });
callSchema.index({ status: 1, createdAt: 1 });
callSchema.index({ invited: 1, status: 1 });

export default mongoose.model('ConnectCall', callSchema);
