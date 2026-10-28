LifeOS NextStep (master prompt, Phase 1)

HOW TO APPLY (Git Bash, from LifeOS-fresh; unzip over the project, it only adds files):
  unzip -o ../LifeOS-nextstep.zip
  cd server && node scripts/apply-nextstep-patch.mjs && cd ..
  cd client && node scripts/apply-nextstep-patch.mjs && cd ..
Read the output. A line starting with WARNING: means that spot was not found; the message says what to add by hand.
No npm install needed. Restart server and client.

FILES CREATED
server/src/models/nextstep.model.js
server/src/utils/nextstep.logic.js
server/src/services/nextstep.service.js
server/src/controllers/nextstep.controller.js
server/src/routes/nextstep.routes.js
server/test/nextstep.unit.test.js
server/scripts/apply-nextstep-patch.mjs
server/docs/NEXTSTEP.md
client/src/api/nextstep.js
client/src/pages/NextStepPage.jsx
client/src/components/nextstep/NextStepCard.jsx
client/scripts/apply-nextstep-patch.mjs

FILES MODIFIED BY THE PATCH SCRIPTS (small, anchored edits)
server/src/routes/index.js            (mount /api/nextstep)
client/src/routes/AppRoutes.jsx       (lazy page + /nextstep route)
client/src/layouts/AppLayout.jsx      (sidebar item "NextStep")
client/src/pages/DashboardPage.jsx    (<NextStepCard /> under the header)

TEST: cd server && node --test test/nextstep.unit.test.js
