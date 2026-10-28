LifeOS Assistant, Phase 3a: Habits + read-only Finance totals

APPLY (from LifeOS-fresh). These files REPLACE the ones from the Assistant zip, so use unzip -o. No patch scripts, no npm install:
  unzip -o ../../LifeOS-assistant-3a.zip
Restart the server and the client.

FILES REPLACED
server/src/utils/assistant.engine.js     (3 new tools)
server/src/services/assistant.service.js (habit + finance code)
server/test/assistant.unit.test.js       (3 more tests)
server/docs/ASSISTANT.md
client/src/pages/AssistantPage.jsx       (suggestion chips only)
No other file is touched.

TEST: cd server && node --test test/assistant.unit.test.js test/nextstep.unit.test.js
