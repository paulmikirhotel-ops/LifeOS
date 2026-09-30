import mongoose from 'mongoose';

const { Schema } = mongoose;

const auditLogSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
    },
    resource: {
      type: String,
      enum: ['income', 'expense', 'category', 'meeting'],
      required: true,
    },
    resourceId: {
      type: Schema.Types.ObjectId,
    },
    details: {
      type: Object,
      default: {},
    },
    ip: {
      type: String,
    },
    createdAt: {
      type: Date,
      immutable: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

auditLogSchema.index({ tenantId: 1, createdAt: -1 });
auditLogSchema.index({ tenantId: 1, userId: 1 });

export default mongoose.model('AuditLog', auditLogSchema);
