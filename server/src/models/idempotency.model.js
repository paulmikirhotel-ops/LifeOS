import mongoose from 'mongoose';

/** Remembers the answer to a write for 24 hours so a retry (flaky signal, offline queue) cannot do it twice. */
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  fingerprint: { type: String, required: true },
  state: { type: String, enum: ['pending', 'done'], default: 'pending' },
  status: { type: Number },
  body: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
}, { versionKey: false });

export default mongoose.models.IdempotencyRecord || mongoose.model('IdempotencyRecord', schema);
