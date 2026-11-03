# Call sound output: loudspeaker, Bluetooth, headset (Android app)

Every call (voice or video) starts on the **loudspeaker**. If a Bluetooth device or wired headset is connected, the sound goes there
automatically, also when it connects in the middle of a call. If it is removed, the sound returns to the loudspeaker.
A button on the call screen and the meeting bar shows where the sound goes (Speaker / Phone / Bluetooth / Headset):
tap to switch between Speaker and Phone, or to pick from a short list when Bluetooth or a headset is connected.
When the call ends, the phone's audio is put back to normal. The button only appears in the Android app (not in browsers).

## Apply
From the repo root, in Git Bash, after unzipping over the project:

    cd client
    node scripts/apply-audio-patch.mjs
    npx vite build
    npx cap sync android

(If it says it could not find `super.onCreate`, run `node scripts/apply-ringtone-patch.mjs` first, then this one again.)
Then in Android Studio: Build > Clean Project, then Run. The first call asks for "Nearby devices" permission: tap Allow (needed to see Bluetooth).
The page code reaches the phone through Netlify, so commit and push `client` too.

## Test
1. Call someone: sound comes from the loudspeaker, button says "Speaker".
2. Tap it: "Phone" (earpiece). Tap again: "Speaker".
3. Connect Bluetooth earbuds, with or without a call running: label becomes "Bluetooth" and sound moves to them.
4. Tap the button: list with Bluetooth, Speaker, Phone. Pick one.
5. Switch the earbuds off: sound returns to Speaker.
6. End the call and play music: the phone behaves normally.

## Files
New: `client/scripts/AudioRoutePlugin.java.tpl`, `client/scripts/apply-audio-patch.mjs`, `client/src/native/audioRoute.js`,
`client/src/native/useAudioRoute.js`, `client/src/native/AudioRouteControl.jsx`, `client/test/audioRoute.test.mjs`, `client/test/audioPatch.test.mjs`, this doc.
Created by the script: `AudioRoutePlugin.java` next to `MainActivity.java`.
Changed by the script: `MainActivity.java`, `AndroidManifest.xml`, `CallScreen.jsx`, `RoomControls.jsx`.
