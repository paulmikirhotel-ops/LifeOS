# Opportunity Radar

Reads public RSS/Atom feeds that the person adds, and shows open jobs, scholarships and grants. Per person, inside the active workspace. Nothing is verified by LifeOS and nothing is invented.

## What is real and what is not
- Items come only from the feeds the person follows. The deadline is shown only if the feed states it (a deadline tag, or text like "Deadline: 30 October 2026"). Otherwise "No deadline listed".
- Type (job / scholarship / grant / other) is guessed from keywords unless the person sets the type on the source. Guessed types are labelled.
- Matching is plain keyword matching (whole words; title counts 2, summary counts 1). Matched keywords show on the card.
- AI is optional and only writes a short "why this match" sentence on request. It never adds, edits or ranks items. Allowance: `RADAR_DAILY_AI` per user per day (default 10).
- Expired items (past deadline) are hidden; undated items are hidden 60 days after they were published.

## Safety
- https only, standard port, no username/password in the address.
- DNS is resolved by the server on every connection (also after each redirect, max 3) and private/local/link-local/reserved addresses are refused (blocks access to the server's own network).
- Download capped at 1.5 MB and 10 seconds. Entities are decoded, never expanded.
- Item links must be http(s); shown with `rel="noopener noreferrer nofollow"`.
- A feed is tested before it is saved. Max 10 feeds per person. A feed is not re-downloaded more often than every 5 minutes.

## API (`/api/radar`)
GET `/feed?type=&closing=1&saved=1` · GET/POST `/sources` · PATCH/DELETE `/sources/:id` · POST `/refresh` · GET/PUT `/profile` · PATCH `/items/:id` {state} · POST `/items/:id/task` · POST `/items/:id/explain`
Reads need `goals.view`; changes need `goals.create`; adding a task also needs `tasks.create`.
"Add deadline to tasks" creates one task once (id reserved first), and only after the person confirms.

## Limits
Feeds are refreshed when the page opens (no background job), so a source updates only when someone opens Radar or taps Refresh. Some sites block feed readers or have no feed.
