import mongoose from 'mongoose';

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: ['personal', 'organization'], required: true },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    settings: {
      currency: { type: String, default: 'USD', maxlength: 3 },
      openingBalance: { type: Number, default: 0, min: 0 },
      defaultWorkingHours: {
        startMin: { type: Number, default: 480 }, // 08:00
        endMin: { type: Number, default: 1200 }, // 20:00
        days: { type: [Number], default: [1, 2, 3, 4, 5] }, // Monday=1 … Friday=5
      },
      allowOverlap: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

tenantSchema.index({ ownerUserId: 1 });

export default mongoose.model('Tenant', tenantSchema);
