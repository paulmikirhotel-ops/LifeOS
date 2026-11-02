LifeOS - calls ring when the Android app is closed (Firebase push)
See docs/ANDROID-CALL-PUSH.md for the files list, apply steps and the test.
Quick apply: unzip, then
  (cd server && node scripts/apply-push-patch.mjs)
  (cd client && npm install @capacitor/push-notifications && node scripts/apply-push-patch.mjs && npx cap sync android)
You also need: client/android/app/google-services.json and Render setting FCM_SERVICE_ACCOUNT.
