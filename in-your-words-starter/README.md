# In Your Words — first functional vertical slice

This starter intentionally ignores the long phase timeline and wires the core loop first:

**Question on screen + TTS → one big press-to-talk → raw audio to Cloudflare R2 → Deepgram Nova-3 transcript → OpenAI interview decision → next question → ElevenLabs TTS.**

The raw audio upload happens before transcription or LLM processing. That is deliberate: the recording is the permanent artifact; the transcript and AI output are derived data.

## What this tests now

- iPad/iPhone/browser microphone capture
- one-touch interview UX
- permanent raw-audio storage in R2
- Deepgram transcription
- three-way intent routing: story answer / app question / app command
- non-leading next-question generation with a structured OpenAI response
- automatic TTS playback using a generic ElevenLabs reader voice
- Postgres persistence of sessions, questions, transcript, intent and AI metadata

## What is deliberately not in this slice

Auth, historical lookup, narrative chapter generation, duplicate detection, contradiction workflow, photo capture, voice cloning, newsreels, export and Remotion video. The database/API boundaries are set up so those can be added without replacing the core capture loop.

## Local setup

1. Create a Neon Postgres database and run `db/schema.sql`.
2. Create a private Cloudflare R2 bucket. Configure CORS to allow PUT from `http://localhost:5173` during local testing.
3. Create API keys for Deepgram, OpenAI API, and ElevenLabs.
4. Choose a generic ElevenLabs reader voice and place its voice ID in `.env`.
5. Copy `.env.example` to `.env` and fill the values.
6. Install and run:

```bash
npm install
npm run dev
```

The web app runs at `http://localhost:5173`; the API runs at `http://localhost:10000`.

For Vite, add `VITE_API_URL=http://localhost:10000` to `apps/web/.env` if needed.

### Credential-free mocked vertical slice

Copy `.env.example` to `.env` and leave `APP_MODE=mock`. Then run `npm install`,
`npm run build`, `npm test`, and `npm run dev`. Mock mode uses an in-memory
Postgres-compatible repository, an in-memory R2 adapter with upload confirmation,
deterministic transcription/interview adapters, and generated WAV audio. It never calls a vendor.

The browser stores the current session ID in local storage and keeps an unconfirmed recording in
IndexedDB. A refresh resumes the session and retries the pending recording. The server confirms
that raw audio exists before transcription, and completed turn processing is idempotent.

### Live services and environment

Set `APP_MODE=live` and configure:

- `DATABASE_URL`: Neon Postgres pooled connection string.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`: private Cloudflare R2 bucket credentials.
- `DEEPGRAM_API_KEY`: Deepgram key with Nova-3 transcription access.
- `OPENAI_API_KEY` and optionally `OPENAI_INTERVIEW_MODEL`: OpenAI Responses API access.
- `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, and optionally `ELEVENLABS_MODEL_ID`: generic reader voice.
- `WEB_ORIGIN`: exact deployed PWA origin.

Apply the database schema with `npm run db:migrate -w @iyw/api`. Configure R2 CORS for the
exact web origin. The application deliberately refuses to expose `/api/dev/bootstrap` when
`NODE_ENV=production`, even if `ALLOW_DEV_BOOTSTRAP=true`.

### Render / Neon / R2 deployment

Create Neon first and apply `db/schema.sql`. Create the private R2 bucket and its CORS policy.
On Render, create a Node web service rooted at the repository, use `npm install && npm run build`
as the build command, `npm run start -w @iyw/api` as the start command, and `/health` as the
health check. Add all live variables above and set `NODE_ENV=production`, `APP_MODE=live`.
Deploy `apps/web/dist` as a static site built with `npm run build -w @iyw/web`, setting
`VITE_API_URL` to the Render API URL. Finally, replace local R2 CORS origins with the static
site origin and run the iPad test script below.

## R2 CORS example for local testing

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Replace the origin with the production web origin before deployment.

## Deployment target

- Web: React PWA on a static host (Cloudflare Pages or Render Static Site)
- API: Render Web Service; health check `/health`; bind to `PORT`
- DB: Neon Postgres
- Media: Cloudflare R2 private bucket

## First test script

1. Open on the actual iPad.
2. Let the app read the opening question automatically.
3. Tap **Press to talk** and answer for 30–90 seconds.
4. Tap once when finished.
5. Verify the R2 object exists before the transcript/next question is returned.
6. Verify the transcript in Postgres matches the audio closely.
7. Inspect the generated question for any fact Dad never stated. Any such assumption is a failure even if the question sounds natural.
8. Mid-interview say: “What year did Nixon resign?” Verify the app answers the general fact and then resumes the exact prior question, without adding the interruption to story content.
9. Say: “Talk slower.” Verify playback rate changes and the interview resumes.

## Production warnings before family rollout

The `/api/dev/bootstrap` route is intentionally temporary and has no authentication. It is suitable only for local/closed first-function testing. Do not expose this build publicly until passwordless access control and per-storyteller authorization are added.

Also review vendor data-retention/privacy settings before using sensitive family recordings at scale. `store: false` is set on the OpenAI Responses call, but that should not be treated as a substitute for a full vendor/privacy review.
