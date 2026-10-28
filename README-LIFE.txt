LifeOS Phase 7: Life Balance, Knowledge, Backup
===============================================
Needs the Opportunities (Radar) phase already applied. Offline mode (Phase 6) is optional.

1. From LifeOS-fresh:
     cd "P:/New folder (2)/LifeOS-phase4-complete/LifeOS-fresh"
     unzip -o ../../LifeOS-life.zip
2. Patches:
     cd server && node scripts/apply-life-patch.mjs && cd ..
     cd client && node scripts/apply-life-patch.mjs && cd ..
   Any line starting with WARNING: tell me which one.
3. Tests (optional):  cd server && node --test test/life.unit.test.mjs test/life.service.test.mjs
4. Restart server and client. Open "My life" in the sidebar.

Try it:
  a. Balance: tap Work, Health. Add 60 minutes to Work and 30 to Health. Bars move. Open "Areas and targets", give Health 4 hours.
  a2. Automatic time: Areas and targets > open "Take time from tasks and calendar" on Work. Type a category you really use on tasks, tick Meetings. Finish a task of that category that has minutes. The Work bar grows and says how much came from tasks and calendar.
  b. Knowledge: Add a lesson with tags, add a link (try javascript:alert(1): it must be refused), search for a word from the title, pin one.
  c. Backup: Download backup file (it now includes your tasks and goals). Delete one Knowledge entry. Choose the file: the summary says N already exist and 1 will be added. Restore: the entry returns once. Restore the same file again: nothing is added.
  d. Edit one letter inside the downloaded file and choose it: it must say the file looks damaged.
  e. Sign in as another account: it must see none of the first account's entries.
