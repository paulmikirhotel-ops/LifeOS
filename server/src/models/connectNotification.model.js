import mongoose from 'mongoose';

const { Schema } = mongoose;

/** A Connect notification for one person (not tied to a workspace). Chat messages use unread counts instead; this is for everything else. */
const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['friend_request', 'friend_accepted', 'group_added', 'missed_call', 'shared_item', 'shared_file', 'mention', 'community_request', 'community_update'], required: true },
    title: { type: String, maxlength: 120, required: true },
    body: { type: String, maxlength: 200, default: '' },
    link: { type: String, maxlength: 200, default: '/connect' },
    conversationId: { type: Schema.Types.ObjectId }, // opening that chat clears these
    readAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 }); // old ones disappear after 90 days

export default mongoose.model('ConnectNotification', schema);
