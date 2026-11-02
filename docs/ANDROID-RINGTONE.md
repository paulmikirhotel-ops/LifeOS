# Call alerts use the phone's own ringtone

Before: call alerts used the phone's default notification sound. Now the app creates a "Calls" alert channel at start-up that uses the phone's ringtone and ring volume, vibrates in a long pattern, and shows on the lock screen. The server sends call alerts to this channel (`calls_ring`).

Limits to know: Android plays an alert's sound once; it does not loop like a real phone call, and a closed app cannot show a full-screen answer screen. A looping ring with a full-screen call screen needs extra native code (a later step). The sound follows the phone's Ring volume and Do Not Disturb settings.

## Files
Replaced: `client/src/native/push.js`, `client/test/push.test.mjs`, `server/src/services/fcm.service.js`, `server/test/fcm.test.mjs` (channel name only).
New: `client/scripts/apply-ringtone-patch.mjs`, `client/test/ringtone.patch.test.mjs`.
Changed by the script: `client/android/app/src/main/java/com/lifeos/app/MainActivity.java`.

## Apply
```
unzip -o "/p/New folder (2)/LifeOS-ringtone.zip"
(cd client && node scripts/apply-ringtone-patch.mjs && node --test test/push.test.mjs test/ringtone.patch.test.mjs)
(cd server && node --test test/fcm.test.mjs)
```
Commit, push to `main`, deploy Render first and Netlify second. Then in Android Studio: Build -> Clean Project, **uninstall LifeOS from the phone**, Run. (The channel is created once; a clean install makes sure it is the new one.)

## Test
Close the app, lock the phone, call it. You should hear your phone's ringtone once and feel the vibration. If it is silent: check the phone is not on silent or Do Not Disturb, the Ring volume is up, and Settings -> Apps -> LifeOS -> Notifications -> Calls has sound set to your ringtone.
