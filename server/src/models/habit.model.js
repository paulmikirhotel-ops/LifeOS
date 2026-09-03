import mongoose from 'mongoose';

const habitSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    description: {
      type: String,
    },
    category: {
      type: String,
    },
    targetPerDay: {
      type: Number,
      default: 1,
      min: 1,
      max: 24,
    },
    color: {
      type: String,
      default: '#6366f1',
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

habitSchema.index({ tenantId: 1, userId: 1 });

const Habit = mongoose.model('Habit', habitSchema);

export default Habit;
