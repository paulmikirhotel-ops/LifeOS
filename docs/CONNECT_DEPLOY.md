# LifeOS Connect: deployment and testing checklist

## Settings (server environment variables)
| Name | What it does | Needed for |
|---|---|---|
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | The same LiveKit project used by meeting rooms | Voice and video calls (the call buttons stay switched off without them) |
| `STORAGE_*` (S3 / B2 settings you already use) or the local driver | Where shared photos, videos and files are stored | Sending files |
| `CONNECT_UPLOAD_MAX_MB` | Largest file in a chat (default 25) | Optional |

Nothing secret is ever sent to the browser: the browser only gets the LiveKit address and a short-lived room token.

## Your host must allow
- **Long-lived connections (SSE)** on the live channel (`GET /api/notifications/stream`). Behind nginx: `proxy_buffering off;` and a read timeout of at least 1 hour. Without this, messages and ringing arrive late.
- **HTTPS** everywhere. Browsers only allow the microphone and camera on HTTPS.
- **One server process** is assumed for live delivery. If you run several, add a shared channel (Redis) before scaling out.

## Before going live: run these checks
1. `cd server && npm test` (all unit tests).
2. Optional database test (use a throw-away database, never the live one):
   `CONNECT_TEST_MONGO_URI="mongodb://127.0.0.1:27017/lifeos_connect_test" node --test test/connect.integration.test.js`
3. Two-account manual test (two browsers, or one normal + one private window):
   - Friend request, accept, chat, read ticks, typing, online dot.
   - Photo, video, document, contact card. A `.html` or `.exe` file must be refused.
   - Group: create, add, remove, make admin, leave.
   - Share a task, goal, event, note, meeting. "Add to my ..." works on the other account.
   - Voice call and video call: ring, answer, mute, camera, hang up. Decline. Let it ring out (45 s) and check "Missed call".
   - Block: the blocked person cannot message, call, search or add you. Unblock from Friends.
   - Report a message: a row appears in the `connectreports` collection.
   - Phone-size screen (about 390 px wide): no sideways scrolling anywhere in Connect.
4. A third account that is not in the chat must get "not found" for its messages, files and calls (the integration test checks this too).

## Honest limits
- Messages, files and calls are protected in transit (HTTPS / secure media connection) and can only be opened by the people in the conversation. They are **not end-to-end encrypted**; do not describe them that way.
- Reports are stored for an administrator to read in the database. There is no admin screen for them yet.
- Browser alerts when LifeOS is closed need push notifications (a later step). Today alerts work while LifeOS is open in a tab.
