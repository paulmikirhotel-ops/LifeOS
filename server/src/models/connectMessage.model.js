import mongoose from 'mongoose';

const { Schema } = mongoose;

/** One chat message. Text is stored as plain text and is only ever shown as text. */
const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'ConnectConversation', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // text | image | video | audio | file | contact | system (e.g. "Ann added Joe")
    kind: { type: String, enum: ['text', 'image', 'video', 'audio', 'file', 'contact', 'resource', 'system'], default: 'text' },
    text: { type: String, default: '', maxlength: 4000 },
    attachment: {
      key: { type: String, maxlength: 300 },
      name: { type: String, maxlength: 140 },
      mime: { type: String, maxlength: 120 },
      size: { type: Number },
    },
    // A LifeOS item shared into the chat (task, goal, event, meeting, note). `data` is a small snapshot taken at share time,
    // so the receiver never gets live access to the sharer's workspace. `added` remembers who copied it into their own workspace.
    resource: {
      type: { type: String, enum: ['task', 'goal', 'event', 'meeting', 'note'] },
      refId: { type: Schema.Types.ObjectId },
      tenantId: { type: Schema.Types.ObjectId },
      title: { type: String, maxlength: 200 },
      subtitle: { type: String, maxlength: 200 },
      data: { type: Schema.Types.Mixed },
      added: { type: [{ _id: false, userId: Schema.Types.ObjectId, refId: Schema.Types.ObjectId }], default: undefined },
    },
    contact: {
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      name: { type: String, maxlength: 100 },
    },
    // One emoji per person per message.
    reactions: { type: [{ _id: false, userId: { type: Schema.Types.ObjectId, ref: 'User' }, emoji: { type: String, maxlength: 8 } }], default: undefined },
    forwarded: { type: Boolean },
    // People @mentioned in a group message (name kept as it was when written).
    mentions: { type: [{ _id: false, userId: { type: Schema.Types.ObjectId, ref: 'User' }, name: { type: String, maxlength: 100 } }], default: undefined },
    replyToId: { type: Schema.Types.ObjectId, ref: 'ConnectMessage' },
    editedAt: { type: Date },
    deletedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

messageSchema.index({ conversationId: 1, _id: -1 });
messageSchema.index({ conversationId: 1, 'attachment.key': 1, _id: -1 }, { sparse: true });

export default mongoose.model('ConnectMessage', messageSchema);
