import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * One in-meeting chat message. Belongs to the meeting (and so to the organizer's workspace), whoever wrote it.
 * `key` is the sender's identity in the room: `u:<userId>` for LifeOS members, `g:<random>` for link joiners.
 */
const meetingMessageSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true },
    key: { type: String, required: true, maxlength: 80 },
    name: { type: String, required: true, maxlength: 120 },
    text: { type: String, required: true, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

meetingMessageSchema.index({ meetingId: 1, _id: 1 });

export default mongoose.model('MeetingMessage', meetingMessageSchema);
