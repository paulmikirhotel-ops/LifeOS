# Offline and low-data mode (Phase 6)

## What it does
- **Offline copies:** every answer for tasks, goals, notes, calendar, NextStep, dashboard, saved Radar items and "who am I" is kept in the phone's IndexedDB (per signed-in person). With no signal, pages get that copy and a banner says "Offline. Showing your saved copy from 10:42."
- **Waiting changes:** adding or editing a task or note without signal saves it on the phone. It shows in the list marked as pending and uploads automatically when the connection returns (also on focus, and every 30 s while something waits). Editing something that only exists on the phone is folded into its waiting "create".
- **Retry protection:** every task/note write carries an `Idempotency-Key`. The server runs the first one and replays its stored answer (24 h) for repeats, so a bad connection cannot create a task twice.
- **Needs review:** if the server rejects a waiting change (for example the task was deleted elsewhere) it moves to "Could not be saved" on the Data page: Try again or Discard. Nothing is overwritten silently.
- **Low-data mode** (Automatic / On / Off in Data and offline): pages reuse a copy younger than 5 minutes instead of asking the server again; Opportunities does not refresh feeds by itself. Automatic follows the browser's Data Saver and slow-network signals where the browser reports them.
- **Connect chats offline** is OFF by default. When switched on, recent chat reads are kept for reading only. Sending always needs internet.

## What never waits (by design)
AI features, Radar refresh, calls and meetings, Community requests/reports/blocking, billing, admin, and anything not listed in `CONFIG.queueResources`.

## Privacy
Copies and the waiting list live only in this browser, keyed by the signed-in person. They are wiped on sign-out and when a different person signs in on the same phone. "Clear offline copies" on the Data page removes the copies (waiting changes stay).

## Known limits (honest list)
- No automatic merge of two different edits to the same item from two devices: the later upload wins unless the server rejects it. A "keep either version" screen is not built.
- Only tasks and notes can be written offline. Deleting offline is not supported.
- "Data used this month" counts server answers seen by this app (estimate), not the phone's real data meter.
- Call video defaults and image loading are not changed by low-data mode in this phase.
- The app shell itself (opening the app with no signal) depends on your existing PWA service worker. This phase does not change it.
- The path names in `client/src/offline/logic.js` (`CONFIG`) must match your API. Edit them if your routes differ.
- Replays of a stored answer are not re-checked for login, because the random key acts as the secret. The key is a UUID made on the phone.

## Files
Client: `src/offline/{logic,store,status,attach}.js`, `src/components/offline/OfflineBanner.jsx`, `src/pages/DataPage.jsx`, `scripts/apply-offline-patch.mjs`, `test/offline.*.test.mjs`.
Server: `src/middleware/idempotency.js`, `src/models/idempotency.model.js`, `scripts/apply-offline-patch.mjs`, `test/idempotency.test.mjs`.
Patched by script: client `src/api/client.js`, `src/routes/AppRoutes.jsx`, `src/layouts/AppLayout.jsx`, `src/pages/RadarPage.jsx`; server `src/routes/index.js`.
