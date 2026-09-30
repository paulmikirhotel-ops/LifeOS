import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'platform-admin'], default: 'user' },
    status: { type: String, enum: ['active', 'suspended', 'deleted'], default: 'active' },
    isEmailVerified: { type: Boolean, default: false },
    activeTenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },

    // Hashed one-time tokens (never store the raw token).
    verificationTokenHash: { type: String, select: false },
    verificationExpiresAt: { type: Date },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date },
    // Single rotating refresh session (hash of the token).
    refreshTokenHash: { type: String, select: false },
    refreshTokenExpiresAt: { type: Date },

    lastLoginAt: { type: Date },
    deletedAt: { type: Date },

    // Personal notification preferences (per user, not tenant data).
    notificationPrefs: {
      sound: { type: Boolean, default: true },
      toast: { type: Boolean, default: true },
      modules: {
        task: { type: Boolean, default: true },
        calendar: { type: Boolean, default: true },
        schedule: { type: Boolean, default: true },
        journal: { type: Boolean, default: true },
        focus: { type: Boolean, default: true },
        finance: { type: Boolean, default: true },
        habit: { type: Boolean, default: true },
        goal: { type: Boolean, default: true },
        meeting: { type: Boolean, default: true },
        system: { type: Boolean, default: true },
        invitation: { type: Boolean, default: true },
      },
    },
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    status: this.status,
    isEmailVerified: this.isEmailVerified,
    activeTenantId: this.activeTenantId ? this.activeTenantId.toString() : null,
    createdAt: this.createdAt,
  };
};

export default mongoose.model('User', userSchema);
