LifeOS: Community extras (Learning resources + Sessions)
========================================================
Needs the Community phase (and the Connect notifications it uses) already applied.

1. From LifeOS-fresh:
     cd "P:/New folder (2)/LifeOS-phase4-complete/LifeOS-fresh"
     unzip -o ../../LifeOS-community-extras.zip
2. Patches:
     cd server && node scripts/apply-community-extras-patch.mjs && cd ..
     cd client && node scripts/apply-community-extras-patch.mjs && cd ..
   Lines should say "patched" or "nothing to do". Any line starting with WARNING: tell me which one.
3. Tests (optional):  cd server && node --test test/communityExtras.logic.test.mjs test/communityExtras.service.test.mjs test/communityExtras.patch.test.mjs
4. Restart server and client. Community now has two more tabs: Learning and Sessions.

Try it (two accounts, A = mentor, B = learner, like the earlier two-phone test; both need a switched-on Community profile):
  Learning
  a. A: Community > Learning > Share a resource. Title "Pivot tables in 10 minutes", address https://example.org/pivot, skill "excel". It appears under "My resources" with the website name.
  b. A: try the address javascript:alert(1): refused. Try a note with a phone number: refused.
  c. B: Learning: sees A's resource, with "Link on example.org". Press "Save to my Knowledge": then My life > Knowledge shows it as a link.
  d. B: Report it. (With a third and fourth account you can see it hide after 3 different reporters; the admin sees it at the bottom of the Community reports page.)
  Sessions
  e. B: Mentors > request a session from A. A: Requests > Accept. (Skip if you already did this.)
  f. B: Sessions > Propose a time: tomorrow 17:00, 30 minutes, note "pivot tables". A gets a notification and sees it under "Waiting for your answer".
  g. A: "Suggest another time" (for example 18:00). B sees it, presses Accept. Both now see "Coming up" with the same moment, each in their own time zone.
  h. B: "Add to my calendar": the event appears in LifeOS Calendar once. Pressing again says it is already there.
  i. Try to propose a time less than 10 minutes from now: refused with a plain message. Try to accept a second proposal that overlaps the agreed one: refused.
  j. A: Cancel session. B gets a notification and the session moves to Recent.
  k. Reminder: propose and accept a session about 20 minutes from now. Within about a minute both accounts get "starts in about N minutes", once.
  l. Block: B blocks A in Connect. B's Sessions list shows no upcoming session with A any more.
