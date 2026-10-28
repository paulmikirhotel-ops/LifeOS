LifeOS Connect - incoming-call fix

REPLACED (whole file, original code kept):
  client/src/utils/callState.js
  client/src/utils/ringtone.js
  client/src/components/connect/IncomingCall.jsx
PATCHED by script:
  client/src/context/ConnectContext.jsx
  server/src/services/connectCall.service.js
NEW:
  client/scripts/apply-callfix-patch.mjs
  server/scripts/apply-callfix-patch.mjs
  client/test/callState.incoming.test.mjs
  client/test/callfix.patch.test.mjs
  server/test/callfix.test.mjs
  docs/CALLS-FIX.md

Apply (Git Bash, repository folder):
  unzip -o "/p/New folder (2)/LifeOS-calls-fix.zip"
  (cd server && node scripts/apply-callfix-patch.mjs)
  (cd client && node scripts/apply-callfix-patch.mjs)

Calls also need LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET on the server. See docs/CALLS-FIX.md.
