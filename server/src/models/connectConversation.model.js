import mongoose from 'mongoose';

const { Schema } = mongoose;

const readSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    readUpTo: { type: Schema.Types.ObjectId },
    deliveredUpTo: { type: Schema.Types.ObjectId },
  },
  { _id: false }
);

/** A one-to-one chat (pairKey = both user ids) or a group (pairKey = group:<id>). Only its members can ever read it. */
const conversationSchema = new Schema(
  {
    type: { type: String, enum: ['direct', 'group'], default: 'direct' },
    // Groups only. Direct chats use the two members' names instead.
    name: { type: String, trim: true, maxlength: 60 },
    description: { type: String, maxlength: 300 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    avatarKey: { type: String, maxlength: 300 }, // group picture in storage
    admins: { type: [Schema.Types.ObjectId], default: [] },
    pairKey: { type: String, required: true, unique: true },
    members: { type: [Schema.Types.ObjectId], ref: 'User', required: true },
    reads: { type: [readSchema], default: [] },
    // Per-person settings: muted (no sound or alerts) and archived (hidden from the main list).
    prefs: { type: [{ _id: false, userId: { type: Schema.Types.ObjectId, ref: 'User' }, muted: { type: Boolean, default: false }, archived: { type: Boolean, default: false } }], default: [] },
    lastMessage: {
      id: { type: Schema.Types.ObjectId },
      text: { type: String, maxlength: 200 },
      senderId: { type: Schema.Types.ObjectId },
      at: { type: Date },
    },
    activityAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

conversationSchema.index({ members: 1, activityAt: -1 });

export default mongoose.model('ConnectConversation', conversationSchema);
