import mongoose from 'mongoose';
import { TENANT_ROLES } from '../config/permissions.js';

const membershipSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: TENANT_ROLES, required: true },
    // Effective permission set snapshot (owner = ['*']).
    permissions: { type: [String], default: [] },
    status: { type: String, enum: ['active', 'invited', 'suspended', 'left'], default: 'active' },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    joinedAt: { type: Date },
  },
  { timestamps: true }
);

membershipSchema.index({ tenantId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ tenantId: 1, status: 1 });
membershipSchema.index({ userId: 1, status: 1 });

export default mongoose.model('Membership', membershipSchema);
