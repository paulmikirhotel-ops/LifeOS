# LifeOS app icon and startup screen (Android)

The app now uses your logo.

- **App icon:** the "L" symbol on black, in every size Android needs (square, round, and the adaptive icon newer phones use).
- **Startup screen:** the full LifeOS logo, centred on black at a fixed size, so it is never stretched on tall or wide phones. Android 12 and newer first show a short system splash with the icon, also on black.

## Files
New (all inside `client/`): `android/app/src/main/res/mipmap-*/ic_launcher.png`, `ic_launcher_round.png`, `ic_launcher_foreground.png`, `mipmap-anydpi-v26/ic_launcher.xml`, `ic_launcher_round.xml`, `values/ic_launcher_background.xml`, `drawable/launch_screen.xml`, `drawable-nodpi/launch_logo.png`, `assets/lifeos-logo.png`, `assets/lifeos-mark.png`, `scripts/apply-launch-patch.mjs`, `test/launch.patch.test.mjs`.
Replaced by the zip: the icon files above that Capacitor created (`ic_launcher*.png`, the two `anydpi` files and `ic_launcher_background.xml`).
Changed by the script: `android/app/src/main/res/values/styles.xml` only.

## Apply
```
unzip -o "/p/New folder (2)/LifeOS-android-icon.zip"
cd client
node scripts/apply-launch-patch.mjs
node --test test/launch.patch.test.mjs
npx cap sync android
```
Then in Android Studio: **Build -> Clean Project**, and press **Run**. If the old icon still shows, uninstall LifeOS from the phone first, then Run again (the phone keeps the old icon cached).

## Changing the logo later
Replace `client/assets/lifeos-mark.png` (square, the symbol on black) and `lifeos-logo.png` (the full logo), and tell me; I regenerate the sizes.
