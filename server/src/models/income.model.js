import mongoose from 'mongoose';

const { Schema } = mongoose;

const incomeSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    source: {
      type: String,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    description: {
      type: String,
    },
    attachments: [
      {
        name: String,
        storedName: String,
        mimeType: String,
        size: Number,
      },
    ],
  },
  {
    timestamps: true,
  }
);

incomeSchema.index({ tenantId: 1, date: -1 });
incomeSchema.index({ tenantId: 1, category: 1 });

export default mongoose.model('Income', incomeSchema);
