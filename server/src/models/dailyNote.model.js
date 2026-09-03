import mongoose from 'mongoose';

const dailyNoteSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['journal', 'myday', 'review'],
      default: 'journal',
    },
    entryDate: { type: Date, required: true, default: Date.now },
    title: { type: String },
    content: { type: String },
    sections: [
      {
        key: { type: String },
        text: { type: String },
      },
    ],
    mood: {
      type: String,
      enum: ['great', 'good', 'ok', 'low', 'bad'],
    },
    tags: [{ type: String }],
    isPrivate: { type: Boolean, default: true },
  },
  { timestamps: true }
);

dailyNoteSchema.index({ tenantId: 1, entryDate: -1 });
dailyNoteSchema.index({ tenantId: 1, authorId: 1, entryDate: -1 });
dailyNoteSchema.index({ tenantId: 1, type: 1 });

export default mongoose.model('DailyNote', dailyNoteSchema);
