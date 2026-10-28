// Run once from the server folder:  node scripts/apply-account-patch.mjs
import fs from 'node:fs';
const edit = (file, fn) => {
  if (!fs.existsSync(file)) return console.log('MISSING:', file);
  const a = fs.readFileSync(file, 'utf8'), b = fn(a);
  if (a === b) return console.log('unchanged:', file);
  fs.writeFileSync(file, b); console.log('patched:  ', file);
};
// 1) user model: new fields
edit('src/models/user.model.js', (s) => {
  if (s.includes('tokenValidAfter')) return s;
  const r = s.replace(/(\n\s*)(lastLoginAt: \{ type: Date \},)/, `$1tokenValidAfter: { type: Date }, // access tokens issued before this are rejected ("sign out everywhere")$1pendingEmail: { type: String, lowercase: true, trim: true },$1pendingEmailTokenHash: { type: String, select: false },$1pendingEmailExpiresAt: { type: Date },$1$2`);
  if (r === s) console.log('WARNING: could not find lastLoginAt in user.model.js - add the 4 fields by hand');
  return r;
});
// 2) authenticate: reject tokens older than tokenValidAfter
edit('src/middleware/authenticate.js', (s) => {
  if (s.includes('tokenValidAfter')) return s;
  const r = s.replace(/(\n\s*)(if \(user\.status === 'suspended'\) \{)/, `$1if (user.tokenValidAfter && payload.iat < Math.floor(user.tokenValidAfter.getTime() / 1000)) {$1  throw ApiError.unauthorized('Session ended. Please sign in again.');$1}$1$2`);
  if (r === s) console.log('WARNING: could not patch authenticate.js - tell Claude');
  return r;
});
// 3) mount /api/account
edit('src/routes/index.js', (s) => {
  if (s.includes('accountRoutes')) return s;
  s = s.replace(/(import authRoutes from '\.\/auth\.routes\.js';)/, `$1\nimport accountRoutes from './account.routes.js';`);
  return s.replace(/(router\.use\('\/auth', authRoutes\);)/, `$1\nrouter.use('/account', accountRoutes);`);
});
// 4) the old password-less delete endpoint is closed; use POST /api/account/delete
edit('src/routes/auth.routes.js', (s) =>
  s.replace(/router\.delete\('\/account', authenticate, authController\.deleteAccount\);/,
    "router.delete('/account', authenticate, (_req, res) => res.status(410).json({ success: false, message: 'Use the Settings page to delete your account (password required).', code: 'GONE' }));"));
