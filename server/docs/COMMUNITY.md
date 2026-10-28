# Community: Skill Exchange and Impact Network

Per person, like Connect (no workspace). Chat, calls, blocking and notifications are Connect's. Community only adds listings and the "agree first" step.

## Rules built in
- **Opt-in.** A profile is off by default. Nothing about a person is listed until they switch it on, with a display name and at least one skill.
- **Visibility.** Per profile and per group: only Connect friends, or everyone in LifeOS. Blocks (either direction) always hide both sides from each other.
- **No contact details.** Display name, intro, skills, group text and request messages are rejected if they look like an email, phone number, link, @handle or chat-app name. This is a heuristic, not a guarantee.
- **Never exposed:** email, account name, goals, tasks, notes, documents, meetings, finances, chats.
- **Agreement before contact.** A session or join request must be accepted. Accepting a mentor request makes both people Connect friends and opens a private chat (Connect shows account names there; the UI says so). Accepting a group request adds the person to the group's Connect group chat.
- **Atomic accept.** The request is claimed first (pending to accepted); group capacity is checked in the same database update. A failed join puts the request back to pending.
- **Anti-spam.** 10 requests/day, 20 open requests, 3 groups/day, 5 open groups, 10 reports/day, 30 writes/minute. New accounts must wait COMMUNITY_NEW_ACCOUNT_HOURS (default 24, 0 turns it off) before starting groups; they can request and join.
- **Reports.** One report per person per target. Three different reporters hide a profile or group until an admin reviews. Admin "dismiss" shows it again if fewer than 3 open reports remain; "reviewed" keeps it hidden.
- **Honesty.** Every list shows "volunteers, not verified". LifeOS does not verify mentors or run background checks.

## Impact Network (volunteering, tutoring, digital skills, community projects)
- A signed-in person with their community profile on can post up to 3 listings a day (5 open at once). Same audience rule (friends or everyone), same contact-detail block.
- **No money asks.** Titles and descriptions that ask for fees, deposits, gift cards, bank details or similar are rejected. Free help only. This is a heuristic; reports still matter.
- **Not verified by default.** The organization name is free text typed by the poster. A "Reviewed by a LifeOS admin" badge appears only when a platform admin switches it on at /admin/community-reports. It is not a guarantee, and LifeOS does not run background checks.
- **"I'm interested"** is a request. If the poster accepts, both become Connect friends and a private chat opens. Spots are counted in the same atomic update that adds the person.
- **Volunteering log** is private. Each entry is separately shared or not (consent). Shared entries only add to an hour total shown on the person's mentor card, never the title or note. Hours are self-reported and unchecked.
- **Safety text** on tutoring: follow the organizer's safeguarding rules. Reports on listings use the same queue; 3 different reporters hide a listing until an admin reviews.

## Not in this release
Learning resources, scheduled sessions with calendar events, and publishing achievements beyond the shared-hours total. Listings are found by simple text search, newest first.

## API (`/api/community`)
GET `/me` · PUT `/profile` · GET `/mentors?q=` · POST `/mentors/request` · GET/POST `/groups` · PATCH `/groups/:id` · POST `/groups/:id/join|leave` · DELETE `/groups/:id/members/:userId` · GET `/requests` · POST `/requests/:id/respond` · DELETE `/requests/:id` · POST `/report` · POST `/block/:userId` · GET/POST `/impact`, PATCH `/impact/:id`, POST `/impact/:id/interest` · GET/POST `/log`, PATCH/DELETE `/log/:id` · admin: GET/PATCH `/admin/reports`, GET `/admin/listings`, PATCH `/admin/listings/:id/verify`.
