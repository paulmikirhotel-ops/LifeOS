# Connect calls: incoming-call fix

## What was traced (before any change)

1. **Caller** presses call -> `POST` start call -> `connectCall.service.js` `startCall()` saves the call and sends
   `{ kind: 'call', event: 'incoming' }` to every OTHER member of the chat with `realtime.emitToUser()`.
2. **Server -> phone**: `realtime.js` keeps one open connection (Server-Sent Events, not Socket.IO) per signed-in
   person and sends the event only to that person's connections. Tests confirm another person never receives it.
3. **Phone**: `NotificationContext` (mounted once at the top of the signed-in app) opens that connection and turns
   `connect` events into a window event. `ConnectContext` (also mounted once at the top) listens and stores the
   ringing call. `IncomingCall` (mounted once next to `AppLayout`) shows the screen and rings.
   None of these live inside a chat page, so the listener is already global.

## What was actually wrong or fragile

| # | Weak spot | Effect | Fix |
| --- | --- | --- | --- |
| 1 | The call screen hid itself by comparing the SERVER's "ringing until" time with the PHONE's clock | A phone whose clock is ahead removed the call screen the moment it appeared (the call then only showed inside the chat as "Join call") | Server now sends `ringLeftMs` (ringing time left); the app adds it to its own clock |
| 2 | The only fallback when the live connection was slow/blocked was opening a chat | Call invisible everywhere except the chat | App asks the server "is anything ringing for me?" every 8 seconds, and when the app is reopened, focused or back online |
| 3 | After Decline/Answer, a late answer from the server could bring the same call back | Duplicate screen / second ring | Calls I am done with are remembered and never shown again; a repeated event keeps one screen |
| 4 | Ringtone is silent until the page has been touched once (browser rule) | Call screen without sound, no explanation | The screen now says "Tap anywhere to turn the ringtone on" |

Separately: **calls need LiveKit on the server.** On your Render server the log says
`Video rooms (LiveKit): NOT READY`, so starting a call returns "Calls are not set up on this server yet" and the
call buttons stay off. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` (a free LiveKit Cloud project
works) in Render -> Environment, then deploy again.

## Files

Replaced (whole file; only additions at the end, or the small edits listed):
- `client/src/utils/callState.js` - original code kept; added `stampCall`, `nextIncoming`, `acceptIncomingEvent`, `CALL_CHECK_MS`, `INCOMING_GRACE_MS`
- `client/src/utils/ringtone.js` - original code kept; added `audioLocked()`
- `client/src/components/connect/IncomingCall.jsx` - uses the server's ring time, shows the sound hint

Patched by script (anchored, safe to re-run):
- `client/src/context/ConnectContext.jsx` - dismissed-calls memory, one-screen rule, 8-second check
- `server/src/services/connectCall.service.js` - adds `ringLeftMs` to the call sent to the app

New:
- `client/scripts/apply-callfix-patch.mjs`, `server/scripts/apply-callfix-patch.mjs`
- `client/test/callState.incoming.test.mjs`, `client/test/callfix.patch.test.mjs`, `server/test/callfix.test.mjs`
- `docs/CALLS-FIX.md`, `README-CALLS-FIX.txt`

## Apply (Git Bash)

```
cd "/p/TASK  MANAGER APP/LifeOS-fresh"
unzip -o "/p/New folder (2)/LifeOS-calls-fix.zip"
(cd server && node scripts/apply-callfix-patch.mjs)
(cd client && node scripts/apply-callfix-patch.mjs)
(cd server && node --test test/callfix.test.mjs)
(cd client && node --test test/callState.incoming.test.mjs test/callfix.patch.test.mjs test/callState.test.mjs test/ringtone.test.mjs)
```

Each patch prints `patched` the first time and `nothing to do` after. Deploy the SERVER first (Render), then the site.

## Two-device acceptance test

Needs LiveKit set up, two accounts that are friends, and two devices or two browsers (A and B).

| # | Do | Expected |
| --- | --- | --- |
| 1 | B on the Dashboard. A calls B | B sees the full-screen call at once and hears the ring (after one tap on the page) |
| 2 | B inside a chat with someone else. A calls B | Same screen on top |
| 3 | B moves between Tasks, Calendar, Journal | Calls still arrive |
| 4 | B taps Answer | Ring stops, call screen opens and connects |
| 5 | B taps Decline | Ring stops; A sees the call end |
| 6 | A cancels while it rings | B's screen and ring stop |
| 7 | Reload B while A's call is still ringing | One call screen, one ring |
| 8 | Third account C, not in the chat | Nothing appears; C cannot open the call |
| 9 | Set B's phone clock one hour ahead, A calls B | The call screen stays up for the full ring time |
| 10 | Block the live connection (developer tools -> Network -> block `notifications/stream`), A calls B | The call appears within about 8 seconds |

## Not covered here

A phone that is closed or in the background is reached by web push (already sent by the server) while the browser
is running. A call that rings a fully closed phone like WhatsApp needs the native Android app with Firebase push and
Android's call notification. That is part of the mobile phase.
