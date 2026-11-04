# Voice call screen: 3D background

On a voice call (no video) the call screen now has floating 3D spheres and, while it rings, thin rings around the caller's picture
(the picture itself and the "Ringing…" text are unchanged). It is only loaded on phones that can show it (no "reduce motion", no data saver,
enough memory and cores, WebGL available); otherwise the call screen looks exactly as before. When a camera turns on, the 3D is removed so it never covers video.

## Apply (Git Bash)
    cd "/p/TASK  MANAGER APP/LifeOS-fresh"
    unzip -o "/p/New folder (2)/LifeOS-call-look.zip"
    cd client
    npx vite build
    cd ..
    git add client docs
    git status --short
    git commit -m "Call screen: 3D background on voice calls"
    git push origin app-update:main

Page code comes from Netlify: no Android rebuild needed.

## Test
Voice call: spheres float behind the picture; rings while ringing; timer and buttons (Mute, Camera, Speaker, End) work as before.
Turn the camera on: spheres disappear. Video call: no spheres. Phone setting "Remove animations" on: plain call screen.

## Files
Replaced (complete files from your latest commit): `client/src/components/connect/call/CallScreen.jsx`, `client/src/components/connect/ConnectOrbs.jsx`,
`client/src/utils/webgl.js`, `client/src/utils/orbScene.js`, `client/test/connect3d.test.mjs`. New: this doc.
