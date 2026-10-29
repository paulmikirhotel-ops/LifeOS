import mongoose from 'mongoose';

const { Schema } = mongoose;

const deviceSchema = new Schema({
  label: { type: String, default: 'Unknown device', maxlength: 80 },
  kind: { type: String, enum: ['web', 'app'], default: 'web' },
  ip: { type: String, default: '', maxlength: 60 }, // already shortened, never a full address
}, { _id: false });

/** One row per signed-in device. Replaces the single refresh token that used to sit on the user. */
const userSessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  refreshHash: { type: String, required: true, unique: true }, // only a hash of the token is stored
  expiresAt: { type: Date, required: true },
  lastUsedAt: { type: Date, default: Date.now },
  device: { type: deviceSchema, default: () => ({}) },
  via: { type: String, enum: ['password', 'register', 'qr'], default: 'password' },
}, { timestamps: true });
userSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // expired sessions clean themselves up

/** One QR sign-in attempt, started on a computer and (maybe) approved on a phone. */
const qrLoginSchema = new Schema({
  codeHash: { type: String, required: true, unique: true }, // hash of the long code inside the QR
  secretHash: { type: String, required: true },             // hash of the secret only the computer's page holds
  pairCode: { type: String, required: true, index: true },  // short code both screens show
  status: { type: String, enum: ['pending', 'approved', 'denied', 'used'], default: 'pending' },
  device: { type: deviceSchema, default: () => ({}) },      // the computer that is asking
  userId: { type: Schema.Types.ObjectId },                  // who approved
  approvedAt: { type: Date },
  usedAt: { type: Date },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
qrLoginSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 600 }); // gone ten minutes after it expires

export const UserSession = mongoose.models.UserSession || mongoose.model('UserSession', userSessionSchema);
export const QrLogin = mongoose.models.QrLogin || mongoose.model('QrLogin', qrLoginSchema);
