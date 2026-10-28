import mongoose from 'mongoose';

/** One browser/phone that agreed to receive alerts. Removed on sign-out, account deletion, or when the push service says it is gone. */
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true, maxlength: 1000 },
    p256dh: { type: String, required: true, maxlength: 200 },
    auth: { type: String, required: true, maxlength: 100 },
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: true }
);

export default mongoose.models.PushSubscription || mongoose.model('PushSubscription', schema);
