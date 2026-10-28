LifeOS Opportunity Radar (master prompt, Phase 4)

HOW TO APPLY (Git Bash, from LifeOS-fresh; unzip over the project, it only adds files):
  unzip -o ../LifeOS-radar.zip
  cd server && node scripts/apply-radar-patch.mjs && cd ..
  cd client && node scripts/apply-radar-patch.mjs && cd ..
Read the output. A line starting with WARNING: means that spot was not found; the message says what to add by hand.
No npm install needed. Restart server and client. Open "Opportunities" in the sidebar.
Optional env: RADAR_DAILY_AI=10 (AI "why this match" per user per day; needs the AI_* settings already used by NextStep).

FILES CREATED
server/src/utils/radar.logic.js
server/src/utils/radar.fetch.js
server/src/models/radar.model.js
server/src/services/radar.service.js
server/src/controllers/radar.controller.js
server/src/routes/radar.routes.js
server/test/radar.unit.test.js
server/scripts/apply-radar-patch.mjs
server/docs/RADAR.md
client/src/api/radar.js
client/src/pages/RadarPage.jsx
client/scripts/apply-radar-patch.mjs

FILES MODIFIED BY THE PATCH SCRIPTS (small, anchored edits)
server/src/routes/index.js         (mount /api/radar)
client/src/routes/AppRoutes.jsx    (lazy page + /radar route)
client/src/layouts/AppLayout.jsx   (sidebar item "Opportunities")

TEST: cd server && node --test test/radar.unit.test.js
Not tested here: real MongoDB, real feeds over the internet, a real browser. Try it by adding one real feed.
