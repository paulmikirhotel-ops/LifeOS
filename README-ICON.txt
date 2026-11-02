LifeOS - Android app icon and startup screen

Apply (Git Bash, repository folder):
  unzip -o "/p/New folder (2)/LifeOS-android-icon.zip"
  cd client
  node scripts/apply-launch-patch.mjs
  node --test test/launch.patch.test.mjs
  npx cap sync android
Then Android Studio: Build -> Clean Project, Run. Uninstall the old app from the phone first if the icon does not change.
Details: docs/ANDROID-ICON-SPLASH.md
