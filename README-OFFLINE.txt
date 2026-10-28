LifeOS Phase 6: offline and low-data mode
=========================================

1. Unzip from LifeOS-fresh (the zip is in the folder above the folder above):
     cd "P:/New folder (2)/LifeOS-phase4-complete/LifeOS-fresh"
     unzip -o ../../LifeOS-offline.zip

2. Apply the patches:
     cd server && node scripts/apply-offline-patch.mjs && cd ..
     cd client && node scripts/apply-offline-patch.mjs && cd ..
   Read what each one prints. A line starting with WARNING means that spot was not found: tell me which one.
   If the server patch says "IMPORTANT: your CORS setup lists allowedHeaders", add 'Idempotency-Key' there.

3. Check client/src/offline/logic.js, top of the file (CONFIG). The words tasks / notes must match your API paths.
   Quick check:  grep -rn "router.use('/tasks\|router.use('/notes" server/src/routes

4. Run the tests (optional):
     cd client && node --test test/*.test.mjs     (needs react installed, it is)
     cd ../server && node --test test/*.test.mjs

5. Start both and try it on ONE phone (or your PC browser with DevTools > Network > Offline):
     a. Sign in, open Tasks, Goals, Opportunities (so copies are saved).
     b. Switch on airplane mode. Open Tasks: banner "Offline. Showing your saved copy".
     c. Add a task "Test offline". It appears with the pending mark. Edit its title.
     d. Switch airplane mode off. Banner: "Uploading..." then "Back online. Uploaded 1 change". Reload: exactly ONE task.
     e. Open Data and offline from the sidebar: try the three settings.
     f. Airplane mode, then try to send a Community request: it must fail with a normal error, not wait.
     g. Sign out, sign in as someone else, turn on airplane mode: the first person's tasks must NOT appear.
