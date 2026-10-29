LifeOS - Sign in with QR + several devices + Linked devices

NEW files
  server/src/utils/deviceLink.logic.js
  server/src/models/deviceLink.model.js
  server/src/services/session.service.js
  server/src/services/deviceLink.service.js
  server/src/controllers/deviceLink.controller.js
  server/src/routes/deviceLink.routes.js
  server/scripts/apply-devices-patch.mjs
  server/test/deviceLink.logic.test.mjs
  server/test/deviceLink.service.test.mjs
  server/test/devices.patch.test.mjs
  client/src/api/deviceLink.js
  client/src/utils/deviceLink.js
  client/src/pages/QrSignInPage.jsx
  client/src/pages/LinkDevicePage.jsx
  client/scripts/apply-devices-patch.mjs
  client/test/deviceLink.utils.test.mjs
  client/test/devices.patch.test.mjs
  docs/DEVICE-LINK.md

CHANGED by the patch scripts (only these)
  server/src/services/auth.service.js
  server/src/controllers/auth.controller.js
  server/src/routes/index.js
  client/src/routes/AppRoutes.jsx
  client/src/pages/LoginPage.jsx
  client/src/layouts/AppLayout.jsx
  client/package.json + package-lock.json (qrcode, jsqr)

Apply (Git Bash, in the repository folder):
  unzip -o "/p/New folder (2)/LifeOS-device-link.zip"
  (cd server && node scripts/apply-devices-patch.mjs)
  (cd client && npm install qrcode jsqr && node scripts/apply-devices-patch.mjs)

Test:
  (cd server && node --test test/deviceLink.logic.test.mjs test/deviceLink.service.test.mjs test/devices.patch.test.mjs)
  (cd client && node --test test/deviceLink.utils.test.mjs test/devices.patch.test.mjs)
  (cd server && npm test)     <- your whole existing suite; tell me if anything that mentions refreshTokenHash fails

Deploy: server FIRST (Render), then publish the site (Netlify).
Full guide and test checklist: docs/DEVICE-LINK.md
