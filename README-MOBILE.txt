LifeOS - Phase 10: Android app wrapper (Capacitor)

NEW files (nothing existing is changed by the zip):
  client/capacitor.config.json
  client/mobile-www/index.html
  client/mobile-www/offline.html
  client/scripts/apply-android-patch.mjs
  client/test/mobile.patch.test.mjs
  docs/MOBILE-ANDROID.md

Apply (Git Bash, in the repository folder):
  cd "/p/TASK  MANAGER APP/LifeOS-fresh"
  unzip -o "/p/New folder (2)/LifeOS-mobile-android.zip"
  cd client
  npm install @capacitor/core @capacitor/android
  npm install -D @capacitor/cli
  npx cap add android
  node scripts/apply-android-patch.mjs
  npx cap sync android
  npx cap open android

Full guide, testing list and troubleshooting: docs/MOBILE-ANDROID.md
