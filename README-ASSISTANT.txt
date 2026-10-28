LifeOS Assistant (master prompt, Phase 2)

APPLY (Git Bash, from LifeOS-fresh; this zip only adds files):
  unzip -o ../../LifeOS-assistant.zip        (adjust the path to where the zip is)
  cd server && node scripts/apply-assistant-patch.mjs && cd ..
  cd client && node scripts/apply-assistant-patch.mjs && cd ..
Needs NextStep (Phase 1) already installed. No npm install. Restart server and client.

FILES CREATED
server/src/utils/assistant.engine.js
server/src/models/assistant.model.js
server/src/services/assistant.service.js
server/src/controllers/assistant.controller.js
server/src/routes/assistant.routes.js
server/test/assistant.unit.test.js
server/scripts/apply-assistant-patch.mjs
server/docs/ASSISTANT.md
client/src/api/assistant.js
client/src/pages/AssistantPage.jsx
client/scripts/apply-assistant-patch.mjs

FILES MODIFIED BY THE PATCH SCRIPTS
server/src/routes/index.js         (mount /api/assistant)
client/src/routes/AppRoutes.jsx    (lazy page + /assistant route)
client/src/layouts/AppLayout.jsx   (sidebar item "Assistant")

TEST: cd server && node --test test/assistant.unit.test.js
