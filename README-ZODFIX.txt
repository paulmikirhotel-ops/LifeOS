LifeOS - small fix: editing one field in My life no longer resets the others

CHANGED by the script (only these two files):
  server/src/utils/life.logic.js      (edit schemas for areas and knowledge entries)
  server/test/life.service.test.mjs   (Windows path in the test)
NEW: server/scripts/apply-zodfix-patch.mjs

Apply (Git Bash, in the repository folder):
  unzip -o "/p/New folder (2)/LifeOS-zodfix.zip"
  (cd server && node scripts/apply-zodfix-patch.mjs)
  (cd server && node --test test/life.unit.test.mjs test/life.service.test.mjs)
