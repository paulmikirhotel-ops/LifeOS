# Testing LifeOS meetings on your computer + a phone (in order)

Do the steps in this order. Each one says what you should see before you move on.

## 0. One-time safety step
Never share `server/.env`. If it was ever sent to anyone (a chat, another person, a zip), replace those keys:
MongoDB password, Backblaze application key, LiveKit API key/secret.

## 1. Install what the fixes added  (this is the step most often missed)
```
cd client
npm install
```
You should see `@vitejs/plugin-basic-ssl` installed. Without it the dev server is plain http and a phone can NEVER
turn its camera or microphone on (browsers hide them on non-HTTPS pages).

## 2. Fill in `server/.env`
Required names (values are yours, never paste them into chat):

| Feature | Variables |
|---|---|
| Database | `MONGODB_URI` |
| Video | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| Recording storage (Backblaze B2) | `STORAGE_DRIVER=s3`, `STORAGE_ENDPOINT`, `STORAGE_REGION` (the real B2 region, not `auto`), `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` |
| **Transcript** | `STT_PROVIDER=deepgram`, `STT_API_KEY`  <- missing = no transcript, ever |
| **AI summary** | `AI_PROVIDER=anthropic` (or `openai`), `AI_API_KEY`  <- missing = no summary, ever |

## 3. Start the server
```
cd server
npm run dev
```
Read the `[env]` lines. Every feature must say `OK`. A line `Missing environment variable: NAME` tells you what to add.
Also expect `[scheduler] started` and `[jobs] runner started`.

## 4. Start the client
```
cd client
npm run dev
```
The first line must say `https://` and show a **Network** address such as `https://192.168.1.20:5173`.
If it shows `http://`, step 1 was not done.

## 5. Open LifeOS on the computer using the Network address
Use `https://192.168.1.20:5173` (your own number), NOT `localhost`. The meeting link you copy is built from the
address in the browser bar, so with `localhost` it would be useless on a phone (LifeOS now warns you about this).
Your browser warns about the certificate (it is self-signed): choose Advanced -> Continue. Safe for your own computer.

Optional: put that same address in `client/.env` as `VITE_PUBLIC_URL=https://192.168.1.20:5173`.

## 6. Phone on the same Wi-Fi
Open the copied link. Accept the certificate warning once (Advanced -> Proceed). Enter the password and a name.
Alternative with no warnings: a tunnel (`cloudflared tunnel --url https://localhost:5173` or `ngrok http https://localhost:5173`).

## 7. Camera and microphone (both devices)
1. Computer: Start meeting -> Join. Camera on, off, on. Mute, unmute.
2. Phone: Join. Camera on, off, on. Mute, unmute.
3. You must see each other and hear each other. Buttons show text: Mic on / Muted, Camera on / Camera off.
4. If a button says "Mic blocked" or "Cam blocked": the page is not HTTPS (step 4/5) or the browser permission was denied.

## 8. Recording
Host ticks the consent box -> Start recording. Everyone sees the red Recording badge. Talk for a minute.
End for everyone. The meeting page shows "Recording saved".

## 9. Transcript and summary
On the meeting page the "Meeting processing" card shows each stage: Recording, Transcript, Summary, Minutes, Action items.
Server terminal, in order:
```
[recording] saved to storage
[transcription] job created / job started
[transcription] recording URL generated
[transcription] storage check passed
[transcription] provider request started / completed
[transcription] transcript saved
[summary] job created / job started / AI request started
[summary] summary saved
```
If a stage fails, the organizer sees the reason on the page (for example `Missing environment variable: STT_API_KEY`)
and a **Try again** button. Fix the cause, then press it.

## 10. Look and feel
The LifeOS logo should be faintly visible behind the login page, the dashboard and the meeting screen, never over text,
buttons or video, and you must still be able to click everything.
