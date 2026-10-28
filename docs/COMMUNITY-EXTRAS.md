# Community extras: Learning resources and Sessions

Both reuse the Community rules that already exist: opt-in profiles, no contact details, report and block, admin review.

## Learning resources (Community > Learning)
- A resource is a title, a web link (http or https only, no user name or password, no IP or local addresses), ONE skill word and an optional short note (200 characters).
- Sharing needs a switched-on Community profile with a display name. Brand-new accounts wait the same time as for Impact listings (`COMMUNITY_NEW_ACCOUNT_HOURS`, default 24).
- Contact details and money asks are blocked in the title, note and skill (the same checks as Impact). The link itself is checked separately.
- Limits: 5 new resources a day, 20 in total per person. The same link cannot be shared twice by one person.
- Everyone signed in can see resources, except people who blocked each other, and resources of people whose profile is switched off.
- The website name is shown next to every link. LifeOS does not check or endorse links, and the page says so.
- "Save to my Knowledge" copies the link into the person's own Knowledge tab (this uses the Knowledge limits of their plan).
- Reports: 3 different people hide a resource until an admin looks. The same person reporting twice counts once. Admin list: Community reports page (bottom). Actions: Mark reviewed (stays hidden), Dismiss (shown again if fewer than 3 open reports remain), Remove resource.

## Sessions (Community > Sessions)
- Only people with an ACCEPTED MENTOR REQUEST between them can plan sessions (study group members are not included, because a group is not one-to-one).
- One person proposes a date, start time, length (15 to 90 minutes, steps of 5) and an optional note. The time is chosen in their own time zone and stored once in UTC, so each person sees it in theirs.
- The other person can accept, decline, or suggest another time (the old proposal closes and a new one goes back).
- Rules: at least 10 minutes ahead, at most 60 days ahead; no double booking of accepted sessions for either person; 10 proposals a day; 10 proposals waiting at once.
- Either person can cancel before it starts; the other is told in Connect.
- Blocking someone cancels the upcoming sessions between you. This is applied whenever sessions are read, so no Connect file was changed.
- "Add to my calendar" adds an event to the person's own LifeOS calendar, once, only when they press it (needs a workspace). Nothing is added automatically.
- Reminder: about 30 minutes before the start, both people get a Connect notification, once. The server checks once a minute while it is awake. On a host that puts the server to sleep, a reminder can be missed.
- Proposals are made from the Sessions tab, not from inside the chat, because the chat page is not part of this change.

## Files
Server (new): `src/utils/communityExtras.logic.js`, `src/models/communityExtras.model.js`, `src/services/resources.service.js`, `src/services/sessions.service.js`, `src/controllers/communityExtras.controller.js`, `src/routes/communityExtras.routes.js`, `scripts/apply-community-extras-patch.mjs`, tests `communityExtras.logic`, `communityExtras.service`, `communityExtras.patch`.
Server (changed by the patch): `src/routes/index.js` (mounts the new routes under /api/community, before the main Community router).
Client (new): `src/api/communityExtras.js`, `src/components/community/LearningTab.jsx`, `SessionsTab.jsx`, `ResourceReportsSection.jsx`, `scripts/apply-community-extras-patch.mjs`.
Client (changed by the patch): `src/pages/CommunityPage.jsx` (two tabs), `src/pages/CommunityReportsPage.jsx` (one section added at the bottom).

## Database
Three new collections: `learningresources`, `resourcereports`, `mentorsessions`. Nothing existing is changed.
