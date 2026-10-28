import mongoose from 'mongoose';

const { Schema } = mongoose;

/** "I blocked this person." Blocking removes the friendship and stops either of us finding or adding the other. */
const blockSchema = new Schema(
  {
    blockerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    blockedId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
blockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
blockSchema.index({ blockedId: 1 });

export default mongoose.model('ConnectBlock', blockSchema);
