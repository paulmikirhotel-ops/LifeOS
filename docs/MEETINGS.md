# LifeOS Meetings — setup, architecture & operations

AI-powered meeting management inside LifeOS: **schedule → start → record → transcribe → summarise →
minutes → action items → ask the meeting → review → export → follow up.**

## 1. What runs where

```
Browser (Netlify)                       API (Render, Node/Express)                 Services
──────────────────                      ─────────────────────────                  ────────
MediaRecorder ─ 10 s chunks ──PUT──►    /meetings/:id/recording/chunks/:n ──────►  Cloudflare R2 (private bucket)
  └ IndexedDB safety copy               (idempotent, size/type checked)
2nd recorder ─ 15 s clips ──POST──►     /meetings/:id/transcribe-chunk ─────────►  Deepgram (live-ish transcript)
Stop ─────────────────────POST──►       /meetings/:id/end  ─► Mongo job queue
                                          finalize_recording  (stream-concat chunks in R2)
                                          transcribe          (Deepgram, diarized, by presigned URL)
                                          analyze             (chunk → summarise each → merge → summary + action items)  ─► LLM
                                          minutes             (from stored notes + DB facts)                             ─► LLM
Player ◄── presigned URL ───────────    /meetings/:id/recording/url  (short-lived, per request)
```

* **Keys are server-side only.** The browser never sees STT/AI/storage credentials.
* **The recording is never deleted because AI fails.** Every stage has its own state and a *Try again* button.
* **Jobs are durable** (MongoDB `jobs` collection). A Render restart resumes them; chunk results of a long
  analysis are saved on the job so a retry doesn't re-pay for finished chunks.
* **No invention:** every extracted item must cite a real transcript line `[seq]`; items citing lines that
  don't exist are dropped. Minutes facts (title, date, chair, participants, action items) come from the database;
  the model writes only narrative. "Ask this meeting" answers only from stored data and cites lines.

## 2. One-time setup

### 2.1 Cloudflare R2 (recording storage)
1. Cloudflare dashboard → **R2** → create a bucket (keep it **private**; do *not* enable public access).
2. **Manage R2 API tokens** → create a token with *Object Read & Write* for that bucket.
3. Note the **Account ID**, **Access Key ID**, **Secret Access Key**.
4. No CORS rule is needed: the browser uploads through your API, and playback uses presigned GET URLs
   opened by an `<audio>` element (no CORS required).

### 2.2 Speech-to-text (Deepgram)
Create an API key at deepgram.com. Verify current pricing, free credit and that **diarization** is enabled for
the model you choose (`STT_MODEL`, default `nova-3`) before relying on speaker labels.

### 2.3 AI provider
* Anthropic: `AI_PROVIDER=anthropic`, `AI_API_KEY`, optional `AI_MODEL` (default `claude-haiku-4-5-20251001`).
* Any OpenAI-compatible API: `AI_PROVIDER=openai`, `AI_MODEL` (required), optional `AI_BASE_URL`.
  (Newer OpenAI models need `AI_MAX_TOKENS_PARAM=max_completion_tokens`.)

### 2.4 Render environment variables (Dashboard → your API service → Environment)
| Variable | Value |
|---|---|
| `STORAGE_DRIVER` | `s3` |
| `STORAGE_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `STORAGE_BUCKET` / `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` | from R2 |
| `STT_PROVIDER` / `STT_API_KEY` | `deepgram` / your key |
| `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` | see above |
| optional | `STT_LANGUAGE`, `STT_LIVE`, `STT_BATCH`, `MEETING_MAX_RECORDING_MB`, `MEETING_CHUNK_MAX_MB` |

Never put any of these in `VITE_*` variables or commit them.
**Never use `STORAGE_DRIVER=local` on Render** — its filesystem is ephemeral; the API refuses it in production.

### 2.5 Grant the new permissions to existing members
Existing memberships store a permission snapshot. From your machine, with `MONGODB_URI` set to your Atlas URI:
```bash
cd server
node scripts/migrate-meeting-permissions.mjs          # dry run
node scripts/migrate-meeting-permissions.mjs --apply
```
Owners (`*`) need nothing. New members get `meetings.*` automatically through their role.

### 2.6 Render **free plan** — what to know
* A free web service sleeps after ~15 minutes without traffic. While recording, chunk uploads every ~10 s keep it
  awake. **Reminders and background jobs only run while the server is awake.** To keep it awake, point a free
  uptime monitor (e.g. UptimeRobot) at `https://<api>/api/health` every 5–10 minutes. A single always-on free
  service fits in Render's monthly free instance hours (verify current limits on Render's pricing page).
* Free instances are small: the job runner is single-threaded on purpose, chunks are streamed (never buffered
  whole), and a 2-hour recording is only ~30–60 MB. Upgrading to a paid instance removes sleeping and cold starts.
* First request after sleeping can take about a minute; the recorder retries and keeps unsent audio on the device.

## 3. Operating limits & known limitations (honest list)
* **One recording session per meeting.** Reloading the page mid-meeting cannot *continue* the same recording
  (a new browser session writes a new audio header). Unsent chunks from the crashed session are re-sent; you can
  then end the meeting to process what was saved.
* **Live transcript is near-live** (~15–25 s behind) and has no reliable speaker labels; speakers are added by the
  diarized pass after the meeting. If that pass fails, the live transcript is kept.
* **Diarization gives "Speaker 1/2…", not identities.** You can rename speakers; LifeOS never guesses who someone is.
* **Recurring meetings** create up to 60 independent instances within 6 months. Editing one edits only that one;
  *Delete* offers "this and later scheduled meetings".
* **PDF export** uses a standard Latin font; use DOCX for other scripts.
* Browser recording needs HTTPS and microphone permission. iOS Safari may stop audio when the screen locks or the tab
  is backgrounded — keep the screen on (LifeOS requests a wake lock where supported).
* Tasks have no assignee field, so *Add to Tasks* records the assignee in the task description.
* Live transcription and post-meeting transcription each send audio to Deepgram (2× audio minutes billed). Set
  `STT_LIVE=false` or `STT_BATCH=false` to use only one.
* Recording legality: the live page asks the organizer to confirm everyone knows the meeting is recorded. Laws differ
  by place — that duty is yours.

## 4. Tests
```bash
cd server
node --test test/meetings.unit.test.js       # no DB: recurrence, chunking, AI/STT parsing, exports
node --test test/meetings.pipeline.test.js   # no DB: long-transcript pipeline with a fake LLM
MONGODB_URI_TEST=mongodb://127.0.0.1:27017 node --test test/meetings.test.js   # API + access control (needs Mongo)
```
Post-deploy smoke test against the live API:
```bash
API_URL=https://<api>.onrender.com SMOKE_EMAIL=… SMOKE_PASSWORD=… node scripts/smoke-meetings.mjs --audio
```

## 5. Production test checklist (do these once on the deployed site)
- [ ] `smoke-meetings.mjs --audio` passes.
- [ ] Schedule a meeting → it shows on **Calendar** and **Meetings → Calendar**; reminder arrives.
- [ ] On **Android Chrome** and **iPhone Safari**: start, record 3 min, pause/resume, mute, stop → recording plays.
- [ ] Turn Wi-Fi off for 30 s mid-recording → banner appears, audio still complete after reconnecting.
- [ ] Record 10 min with 2+ voices → live text appears; after ending, speakers are labelled; summary/minutes/actions appear.
- [ ] 2-hour test (or `MEETING_MAX_RECORDING_MB` small + long silence): memory stays flat, processing completes.
- [ ] Break the AI key on purpose → meeting still saved, **Try again** works after fixing it.
- [ ] Second user (not invited) cannot open the meeting URL, recording URL or export (404).
- [ ] Share link works while logged out, hides the recording, and stops working after **Revoke**.
- [ ] Export TXT/PDF/DOCX/CSV open correctly; "Add to Tasks" creates a task and status stays in sync.
