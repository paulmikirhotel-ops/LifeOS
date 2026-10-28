# Phase 7: Life Balance, Knowledge, Backup

Route `/life` (tabs Balance, Knowledge, Backup). Server `/api/life/...`. All data is per person inside the active workspace. Reads need `goals.view`, changes need `goals.create`.

## Life Balance
- The person creates their own areas (up to 12) and an optional weekly target per area. Suggestions (Work, Learning, Health, Family, Rest) are buttons, not defaults.
- Time is logged by hand (1 to 1440 minutes, dated up to tomorrow and up to about a year back, 50 entries per day).
- Week view (Monday to Sunday, UTC dates) shows minutes vs the person's own target and the usual of the last 4 weeks.
- A neutral note appears only when an area stayed under its own target for 3 weeks in a row, and only counting weeks since the person first logged anything.
- Automatic time (optional, per area, chosen by the person): finished tasks whose category matches the area (actual minutes, else the estimate, counted on the day completed) and calendar events of chosen types that have already ended (their length, counted on the day they started; all-day events are skipped; meetings appear as calendar events of type "meeting"). Each task or event goes to the first matching area only. Finished tasks with no minutes are listed as "not counted", never guessed. Only your own tasks and calendar are read.

## Knowledge
- Notes, links and lessons, up to 2000 entries, tags (8 per entry), pin, edit, delete.
- Search: every typed word (up to 5) must appear in the title, details, tags or link. Links must be http(s) without a username or password; they open with rel="noopener noreferrer nofollow".
- Not built: prompts when a goal finishes, linking an entry to a goal or task, saving from Opportunities with one tap.

## Backup
- Download: one JSON file with the tasks and goals you created, Knowledge, areas (with their automatic sources), logged time, Opportunity feeds and keywords. Tasks keep the title of their goal, so the link is restored. It has a SHA-256 checksum, so a damaged or edited file is refused.
- Restore: choose the file, see a summary, confirm. It only adds what is missing (matching by content), never overwrites or deletes, respects the limits, drops unsafe links, re-checks feed addresses with the Opportunities safety rules, and is limited to 5 restores a day.
- The file is sent as `application/octet-stream` (max 5 MB), so the normal JSON size limit does not cut it off.
- Restoring tasks needs the tasks.create permission; without it tasks are listed but not added. Duplicates are detected by title, due date and description.
- Not included: meetings, calendar events, tasks created by other people, Connect chats, Community profile, saved opportunity items, passwords and sign-in details. Not encrypted. Older backups (made before tasks and goals were added) still restore.

## Files
Server: `src/utils/life.logic.js` (uses the app's own Task, Goal and CalendarEvent models from `models/index.js`; if one is not exported there that part is skipped), `src/models/life.model.js`, `src/services/life.service.js`, `src/controllers/life.controller.js`, `src/routes/life.routes.js`, `scripts/apply-life-patch.mjs`, `test/life.unit.test.mjs`, `test/life.service.test.mjs` (runs the real service against in-memory stand-ins; no database needed).
Client: `src/api/life.js`, `src/pages/LifePage.jsx`, `src/components/life/{BalanceTab,KnowledgeTab,BackupTab}.jsx`, `scripts/apply-life-patch.mjs`.
Patched: server `src/routes/index.js`; client `src/routes/AppRoutes.jsx`, `src/layouts/AppLayout.jsx`.
