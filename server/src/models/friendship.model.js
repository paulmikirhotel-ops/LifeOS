import mongoose from 'mongoose';

const { Schema } = mongoose;

/** A friend request or friendship between two users. User-level (not tied to a workspace). */
const friendshipSchema = new Schema(
  {
    requesterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    addresseeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    pairKey: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
  },
  { timestamps: true }
);

friendshipSchema.index({ addresseeId: 1, status: 1 });
friendshipSchema.index({ requesterId: 1, status: 1 });

export default mongoose.model('Friendship', friendshipSchema);
