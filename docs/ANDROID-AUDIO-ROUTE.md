# Call sound output and ringing (Android app)

**Where sound starts (like WhatsApp):** voice calls start on the phone **earpiece**, video calls on the **loudspeaker**.
If Bluetooth or a wired headset is connected, sound goes there automatically, also when it connects mid-call.
When it is removed, sound returns to where the call started. A button on the call screen and the meeting bar shows where the sound goes
(Speaker / Phone / Bluetooth / Headset): tap to switch between Phone and Speaker, or to pick from a list when Bluetooth or a headset is connected.
When the call ends, the phone's audio is put back to normal. The button only appears in the Android app.

**Ringing for the caller:** after you call, the screen says "Calling…" while it connects, then "Ringing…" with an animated ring around the
picture until the other person answers. The ringback tone keeps playing as before.

## Apply (client folder, after unzipping over the project)
First time for audio (already done if you applied the first audio zip):

    node scripts/apply-audio-patch.mjs

Then this update:

    node scripts/apply-audio-route-v2-patch.mjs
    npx vite build
    npx cap sync android

Android Studio: Build > Clean Project, then Run. Commit and push `client` and `docs` so Netlify gets the call screen.

## Test
1. Voice call: sound is on the earpiece, label "Phone". Tap: "Speaker". Tap again: "Phone".
2. Video call: starts on "Speaker".
3. Connect Bluetooth earbuds, before or during a call: label "Bluetooth", sound moves to them. Tap to see the list.
4. Switch the earbuds off: voice call returns to Phone, video call to Speaker.
5. Caller: "Calling…" then "Ringing…" with the animated ring, until the other person answers.

## Files
New: `client/scripts/apply-audio-route-v2-patch.mjs`, `client/test/audioRouteV2Patch.test.mjs`.
Changed in the zip: `client/scripts/AudioRoutePlugin.java.tpl`, `client/src/native/useAudioRoute.js`, this doc.
Changed by the script: `AudioRoutePlugin.java` (replaced), `CallScreen.jsx`.
(The zip also contains the first audio files unchanged, so unzipping is safe on top of the earlier one.)
