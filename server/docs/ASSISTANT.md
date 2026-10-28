# Assistant (Phase 2 of the master prompt)

A chat that READS your tasks, events and goals and PROPOSES changes. Nothing changes until you press Confirm.

## Setup
No new packages. Uses the same AI settings as Meetings and NextStep (AI_PROVIDER, AI_API_KEY, AI_MODEL, AI_BASE_URL).
Optional: ASSISTANT_DAILY_AI=20 (messages per person per UTC day, 1 to 200, default 20).
On a free AI plan, keep AI_MIN_INTERVAL_MS=3000 so several rounds in one message stay under the provider limit.

## What it can do (fixed list, nothing else is possible)
Read:  list_tasks, list_events, list_goals, nextstep_progress, list_habits, finance_summary (read-only totals, needs finance.view)
Write (proposal + Confirm): create_task, update_task_due, complete_task, create_event, mark_nextstep_done, log_habit (needs habits.edit; undo takes back that one count)
Not possible: deleting anything, recording or changing money, Meetings, Connect, messaging people.

## Safety rules
- The model only returns JSON text. It has no database access. The server runs a fixed list of tools.
- Every tool argument is validated with strict schemas; ids must exist in YOUR workspace.
- Permissions are checked when the model asks AND again when you confirm (tasks.view/create/edit, schedule.view/create, goals.view/create).
- Confirm is atomic (pending -> confirmed once), expires after 15 minutes, and runs the stored arguments through validation again.
- Text from your data (task titles, notes) is passed as labelled data and the system rules forbid obeying it.
- Free-tier cap per person per day; a failed AI call is not counted. Undo exists for create/move/complete.

## API (/api/assistant)
GET /status, GET /chats, GET/DELETE /chats/:id, POST /chat {message, chatId?}
POST /proposals/:id/confirm | cancel | undo
