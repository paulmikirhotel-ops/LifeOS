LifeOS Community: Skill Exchange + Impact Network  (master prompt, Phase 5, parts 1 and 2)
This zip contains everything for Community. It REPLACES the files from LifeOS-community.zip, so unzip it over them.

HOW TO APPLY (Git Bash), from the folder that contains server and client:
  cd "/p/New folder (2)/LifeOS-phase4-complete/LifeOS-fresh"
  unzip -o "../../LifeOS-community-impact.zip"
  cd server && node scripts/apply-community-patch.mjs && cd ..
  cd client && node scripts/apply-community-patch.mjs && cd ..
The patch scripts are safe to run again; they will say "nothing to do" if already applied.
No npm install needed. Restart server and client.
Optional env: COMMUNITY_NEW_ACCOUNT_HOURS=24 (0 = no waiting period for new accounts)

FILES CREATED OR REPLACED
server/src/utils/community.logic.js        (replaced: adds listing, money-ask and log rules)
server/src/models/community.model.js       (replaced: reports can target listings)
server/src/models/impact.model.js          (new)
server/src/services/communityShared.js     (new)
server/src/services/community.service.js   (replaced)
server/src/services/impact.service.js      (new)
server/src/controllers/community.controller.js (replaced)
server/src/routes/community.routes.js      (replaced; includes the rate-limit fix)
server/test/community.unit.test.js         (replaced)
server/scripts/apply-community-patch.mjs
server/docs/COMMUNITY.md
client/src/api/community.js                (replaced)
client/src/pages/CommunityPage.jsx         (replaced: new tabs)
client/src/pages/CommunityReportsPage.jsx  (replaced: adds the listing review badge section)
client/src/components/community/shared.jsx (new)
client/src/components/community/ImpactTab.jsx (new)
client/src/components/community/VolunteerLog.jsx (new)
client/scripts/apply-community-patch.mjs

FILES MODIFIED BY THE PATCH SCRIPTS: same four as before (routes index, connect notification types, AppRoutes, AppLayout).

TEST: cd server && node --test test/community.unit.test.js
Not tested here: real MongoDB, two real accounts, a browser. With two accounts:
 Impact: A posts an opportunity (Community > Impact Network > Post). B clicks "I'm interested".
 A: Requests > Accept. Both get a Connect chat. Then try Report, Close listing, and the Volunteer log tab
 (add an entry, tick Share, look at your mentor card as the other account).
