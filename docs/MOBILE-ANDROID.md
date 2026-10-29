# LifeOS for Android (Capacitor wrapper)

The Android app is a thin shell around your live site. It opens `https://lifepilot-os.netlify.app` inside a
native app. When you deploy a new version of the site on Netlify, the app shows it straight away - no new app
release is needed. If the phone has no internet, the app shows a small "You are offline" screen with a
"Try again" button.

## What is in this phase

| File | What it is |
| --- | --- |
| `client/capacitor.config.json` | App name (LifeOS), app id (`com.lifeos.app`), and the live site address. |
| `client/mobile-www/index.html` | Tiny fallback page (never normally seen). |
| `client/mobile-www/offline.html` | The "You are offline" screen. |
| `client/scripts/apply-android-patch.mjs` | Run once after `cap add android`. Adds camera/microphone permissions and cookie support. |
| `client/test/mobile.patch.test.mjs` | Tests for the script above and the config. |
| `docs/MOBILE-ANDROID.md` | This guide. |

No existing file is changed. You install three packages by hand (below), so `client/package.json` and
`client/package-lock.json` change when you run `npm install`.

## One-time setup on your PC

1. Install Android Studio (https://developer.android.com/studio). Keep the standard options and let it
   download its components. You never need to create a project in it.
2. Use the repository folder `P:\TASK  MANAGER APP\LifeOS-fresh` for everything from now on.

## Build steps (Git Bash)

```
cd "/p/TASK  MANAGER APP/LifeOS-fresh"
unzip -o "/p/New folder (2)/LifeOS-mobile-android.zip"
cd client
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli
npx cap add android
node scripts/apply-android-patch.mjs
npx cap sync android
npx cap open android
```

The script prints `AndroidManifest.xml: patched` and `MainActivity.java: patched`. If you run it again it
prints `nothing to do`.

Android Studio opens. Wait for the bar at the bottom to finish ("Gradle sync"). The first time this takes
5 to 15 minutes and downloads a lot.

## Run it on your phone

1. On the phone open Settings -> About phone and tap **Build number** 7 times. Developer mode turns on.
2. Open Settings -> Developer options and turn on **USB debugging**.
3. Plug the phone into the PC with a USB cable. Accept the "Allow USB debugging?" question on the phone.
4. In Android Studio pick your phone in the device list at the top, then press the green **Run** triangle.
5. The LifeOS app is installed and opens.

No phone? In Android Studio open **Device Manager** -> **Create Virtual Device**, pick any Pixel phone and
the recommended Android version, then Run on it. Camera and microphone are awkward on emulators, so use a
real phone to test meetings.

## What to test

1. The app opens on the LifeOS login screen.
2. Sign in. Close the app completely (swipe it away) and open it again: you should still be signed in.
3. The phone's Back button goes to the previous screen, and leaves the app from the first screen.
4. Turn on Airplane mode and reopen the app: the offline screen shows. Turn it off and press Try again.
5. Open a meeting and allow the camera and microphone when Android asks.
6. Open the Plan page, My life, Radar, Community.

If sign in fails or you are signed out as soon as you reopen the app, tell me. The fix is to send the API
through the Netlify address so the cookie is no longer "third party". I have not applied that yet because it
changes the live site's settings.

## Get an APK file to share

In Android Studio: **Build** -> **Generate App Bundles or APKs** -> **Generate APKs**. The file is at
`client/android/app/build/outputs/apk/debug/app-debug.apk`. Send it to a phone and open it (the phone asks to
allow installs from that source). This is a debug build, good for testing only.

## Keep the Android folder in Git

`npx cap add android` creates `client/android`. Commit it (it has its own `.gitignore` for build output):

```
cd "/p/TASK  MANAGER APP/LifeOS-fresh"
git add client/android client/capacitor.config.json client/mobile-www client/scripts/apply-android-patch.mjs client/test/mobile.patch.test.mjs docs/MOBILE-ANDROID.md client/package.json client/package-lock.json
git commit -m "Add Android app wrapper (Capacitor)"
```

## Google Play later

- A Play developer account costs 25 USD once.
- Google can reject apps that are only a website in a frame. Before a store release we should add real phone
  features (push notifications, a proper icon and splash screen, sharing into the app). That is a later phase.
- The store needs a release build signed with your own key. Keep that key file and its password safe: losing
  it means you cannot update the app.

## If something goes wrong

- **`npx cap add android` says the web directory is missing**: you are not in the `client` folder, or the zip
  did not unpack `client/mobile-www`.
- **Gradle sync fails with a Java error**: in Android Studio open Settings -> Build Tools -> Gradle and set
  "Gradle JDK" to the bundled JetBrains Runtime (jbr).
- **The phone is not in the device list**: unplug and replug, accept the prompt on the phone, and make sure
  the cable carries data (some cables only charge).
- **White screen on start**: check the phone has internet and the site opens in the phone's browser.
