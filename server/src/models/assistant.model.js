import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, default: '', maxlength: 2500 },
    proposalIds: [{ type: mongoose.Schema.Types.ObjectId }],
    blocked: [{ tool: String, reason: String }],
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const chatSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, default: 'New chat', maxlength: 80 },
    messages: [messageSchema],
  },
  { timestamps: true }
);
chatSchema.index({ tenantId: 1, userId: 1, updatedAt: -1 });

export const AssistantChat = mongoose.model('AssistantChat', chatSchema);

/** A change the assistant wants to make. It only runs after the person confirms it. */
const proposalSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    chatId: { type: mongoose.Schema.Types.ObjectId, required: true },
    tool: { type: String, required: true },
    args: { type: mongoose.Schema.Types.Mixed, required: true },
    summary: { type: String, required: true, maxlength: 200 },
    details: [{ type: String, maxlength: 120 }],
    status: { type: String, enum: ['pending', 'confirmed', 'cancelled', 'failed'], default: 'pending' },
    expiresAt: { type: Date, required: true },
    result: { type: String, maxlength: 200 },
    undo: { type: mongoose.Schema.Types.Mixed }, // how to reverse it, built from real data at confirm time
    undoneAt: { type: Date },
    purgeAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);
proposalSchema.index({ _id: 1, userId: 1, tenantId: 1 });

export const AssistantProposal = mongoose.model('AssistantProposal', proposalSchema);

/** One row per person per UTC day: assistant messages used. Rows expire after 3 days. */
const usageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  day: { type: String, required: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});
usageSchema.index({ userId: 1, day: 1 }, { unique: true });

export const AssistantUsage = mongoose.model('AssistantUsage', usageSchema);
