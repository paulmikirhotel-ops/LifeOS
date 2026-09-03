import mongoose from 'mongoose';
import { TENANT_ROLES } from '../config/permissions.js';

const invitationSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: TENANT_ROLES, default: 'viewer' },
    permissions: { type: [String], default: [] },
    tokenHash: { type: String, required: true, select: false },
    status: { type: String, enum: ['pending', 'accepted', 'revoked', 'expired'], default: 'pending' },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

invitationSchema.index({ tokenHash: 1 }, { unique: true });
invitationSchema.index({ tenantId: 1, email: 1, status: 1 });

export default mongoose.model('Invitation', invitationSchema);
