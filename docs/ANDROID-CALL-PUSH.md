# Calls that ring when the LifeOS Android app is closed

When someone calls you in Connect and the app is closed or in the background, Google's push service (Firebase) wakes your phone with a loud "X is calling" alert. Tapping it opens Connect, where the normal answer / decline screen appears. When the app is open, the in-app ring screen is used as before and no alert is shown.

What this is, and is not: a high-priority alert in a loud "Calls" channel that shows on the lock screen and vibrates. It is not yet a full-screen WhatsApp-style call screen over the lock screen; that needs extra native code and is a later step.

## How it fits together
- Each phone that signs in to the app gets a push address from Google. The app sends it to the server, which keeps it on that device's session. Signing out of the phone, or removing it in **Link a device**, ends the ringing on that phone.
- When a call starts, the server sends the alert to every signed-in phone of each invited person (30 seconds to live, then it is dropped). A phone whose app was uninstalled is forgotten automatically.
- No new server package: the server signs its own request to Google with Node's crypto.

## Files
New, server: `src/services/fcm.service.js`, `scripts/apply-push-patch.mjs`, tests `fcm.test.mjs`, `push.patch.test.mjs`.
Replaced, server (they are the files from the device-link phase, with a few lines added): `src/models/deviceLink.model.js` (adds `pushToken`), `src/services/session.service.js`, `src/controllers/deviceLink.controller.js`, `src/routes/deviceLink.routes.js` (adds `POST/DELETE /api/auth/link/push-token`), `src/utils/deviceLink.logic.js`.
Changed by the script, server: `src/services/connectCall.service.js` (one added line plus an import).
New, client: `src/native/push.js`, `src/hooks/useNativePush.js`, `scripts/apply-push-patch.mjs`, `test/push.test.mjs`.
Changed by the script, client: `src/layouts/AppLayout.jsx` (one import and one line), `android/app/src/main/AndroidManifest.xml` (notification permission).
Package added: `@capacitor/push-notifications`.
You add by hand: `client/android/app/google-services.json` and the Render setting `FCM_SERVICE_ACCOUNT`.

## Steps
1. **Firebase** (once): create project `LifeOS`; add an Android app with package name `com.lifeos.app`; download `google-services.json` into `client/android/app/`. Then Project settings -> Service accounts -> Generate new private key; keep that second file private.
2. **Render**: Environment -> add `FCM_SERVICE_ACCOUNT` = open the private key file, copy the whole content, paste as the value. Never commit that file or post it in a chat.
3. **Apply** (Git Bash, repo folder):
```
unzip -o "/p/New folder (2)/LifeOS-call-push.zip"
(cd server && node scripts/apply-push-patch.mjs)
(cd client && npm install @capacitor/push-notifications && node scripts/apply-push-patch.mjs)
(cd server && node --test test/fcm.test.mjs test/push.patch.test.mjs test/deviceLink.service.test.mjs)
(cd client && node --test test/push.test.mjs)
(cd client && npx cap sync android)
```
4. Commit, push to `main`, deploy Render first, then publish Netlify (the app loads the site, so it gets the new code).
5. Android Studio: **Build -> Clean Project**, **Run** (the app must be rebuilt once, because it has a new plugin).

## Test (needs two accounts and two devices)
1. In the app, sign in. Android asks to allow notifications: tap **Allow**.
2. Close the app completely (swipe it away). Lock the phone.
3. From another account (computer) start a voice call to this account. Within a few seconds a loud "X is calling" alert appears. Tap it: the app opens on Connect with the answer screen.
4. Sign out in the app, call again: no alert. Sign back in: alerts return.
5. If nothing arrives: on the phone open Settings -> Apps -> LifeOS -> Notifications and check **Calls** is on; turn off battery optimisation for LifeOS (some brands such as Xiaomi, Tecno, Infinix and Samsung stop closed apps); in Render check the logs for `[fcm]` lines.

## Not tested here
No phone, Google or real MongoDB was available to me. The server was tested against a pretend Google with a real signing key; the phone side needs your test above.
