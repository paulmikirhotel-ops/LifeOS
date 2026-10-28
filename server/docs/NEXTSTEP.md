# NextStep (Phase 1 of the master prompt)

One goal -> an AI roadmap draft -> you edit and approve -> only approved steps become real Tasks / Calendar events.

## Setup (free testing)
No new packages. NextStep uses the AI you already configured for Meetings
(`AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`). For a free tier such as Groq, also set
`AI_MIN_INTERVAL_MS` (for example 3000) so requests stay under the provider's per-minute limit.

Optional: `NEXTSTEP_DAILY_AI=5` (AI drafts + revisions per person per UTC day, 1 to 50, default 5).

## API (all under /api/nextstep, signed-in + active workspace)
GET  /                      your roadmaps + AI allowance left
GET  /next                  the single next step (no AI, reads approved steps only)
POST /plans                 {goalText, hoursPerWeek?, targetDate?}  -> AI draft (uses 1 allowance)
GET/PATCH/DELETE /plans/:id (DELETE = archive; created tasks are kept)
POST /plans/:id/revise      {instruction} -> AI replaces only the draft steps (uses 1 allowance)
POST /plans/:id/approve     creates Tasks/Events for ticked steps (idempotent)
POST/PATCH/DELETE /plans/:id/items[/:itemId]   edit draft steps
POST /plans/:id/items/:itemId/mark   {action:'done'|'later'}

## Safety rules built in
- The AI never writes to your data. It only returns a draft; the server validates and clamps it.
- Dates are computed by the server, not by the AI. No made-up course names, prices or links (prompt rule).
- Approve is idempotent: ids are reserved before creating, so a retry never duplicates tasks.
- Events are placed at 09:00 UTC on the due date; edit the date or move them in Calendar.
- Permissions: reads need goals.view, writes need goals.create, approving also needs tasks.create / schedule.create.
