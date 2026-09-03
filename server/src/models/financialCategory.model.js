import mongoose from 'mongoose';

const { Schema } = mongoose;

const financialCategorySchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['income', 'expense'],
      required: true,
    },
    color: {
      type: String,
      default: '#64748b',
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

financialCategorySchema.index({ tenantId: 1, type: 1, name: 1 }, { unique: true });

export default mongoose.model('FinancialCategory', financialCategorySchema);
