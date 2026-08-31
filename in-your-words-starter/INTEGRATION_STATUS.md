# Integration status

Audit date: 2026-08-31. The verified iPad flow is running with `APP_MODE=mock`.
Live-provider code paths exist for each planned vendor, but none has completed a
two-turn iPad test. No provider should be described as integrated until that test passes.

| Component | Current implementation | Mock or real | Required credentials/config | Next integration step |
|---|---|---|---|---|
| iPad capture and recovery | WebKit `MediaRecorder`; Safari-compatible MIME selection; pending audio stored as an `ArrayBuffer` in IndexedDB | Real browser behavior | Trusted HTTPS origin and microphone permission | Preserve unchanged while each provider is tested |
| Development HTTPS | Two account-less Cloudflare Quick Tunnels proxy ports 5173 and 10000 | Real but temporary | `VITE_API_URL`, `PUBLIC_API_URL`, `WEB_ORIGIN`; running `cloudflared` processes | Recreate URLs and rebuild the frontend whenever a quick tunnel restarts |
| Raw-audio storage | `STORAGE_PROVIDER=mock|r2` explicitly selects either the process-local Map or S3-compatible presigned PUT/GET plus HEAD; R2 errors fail closed | Mock/in-memory in the tested flow; R2-only mode prepared but unverified | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, bucket CORS | First real integration: upload to private R2, HEAD-confirm, retrieve, and play the exact object in a two-turn iPad test |
| Transcription | Returns the fixed sentence “I remember a small garden behind the house.”; live code path calls Deepgram `/v1/listen` with `nova-3` | Mock in the tested flow; live adapter unverified | `DEEPGRAM_API_KEY`; a retrievable R2 audio URL | After R2 passes, enable Deepgram only and verify the actual transcript for two turns |
| Interview engine | Deterministic keyword routing and a fixed follow-up question; live OpenAI Responses code requests the existing strict JSON schema | Mock/simulated in the tested flow; live adapter unverified | `OPENAI_API_KEY`, `OPENAI_INTERVIEW_MODEL` | After Deepgram passes, enable OpenAI only; validate all three intents and non-leading structured output over two turns |
| Session and turn persistence | Process-local Maps emulate the SQL queries; all sessions and turns disappear when the API restarts | Mock/in-memory in the tested flow; Postgres adapter and schema unverified | `DATABASE_URL`; applied `db/schema.sql` | After OpenAI passes, migrate Neon, verify session/turn/audio/transcript/entity persistence and restart recovery |
| Question speech | Mock API returns a generated silent WAV and signals the frontend to use browser `speechSynthesis`; live code path calls ElevenLabs | Mock/browser voice in the tested flow; live adapter unverified | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, optional `ELEVENLABS_MODEL_ID` | Last integration: enable ElevenLabs only and verify automatic generic-voice playback for two turns |
| Development bootstrap | Unauthenticated `/api/dev/bootstrap`; storyteller name defaults to “Dad”; the opening question is hardcoded | Hardcoded development-only behavior | `ALLOW_DEV_BOOTSTRAP=true` outside mock mode; route is disabled when `NODE_ENV=production` | Keep isolated for integration testing; do not expose as production auth |
| Frontend API routing | Public API base is compiled from `VITE_API_URL`; source still defaults to `http://localhost:10000` when unset | Real configuration with a development fallback | `VITE_API_URL` containing only the public API origin—never secrets | Require an explicit tunneled/live value for every iPad build |
| Test suite | HTTP vertical-slice and interview-contract tests use mock providers and in-memory state | Mock test coverage | `APP_MODE=mock` | Add provider-specific integration tests one service at a time without weakening mock tests |
| Secret hygiene | Root `.gitignore` protects environment files, credentials, keys, tunnel artifacts, databases, and build output while preserving `.env.example`; current tree and eight commits scanned clean | Ready for controlled local credential creation after review | Keep real values only in ignored local environment files | Re-run `git check-ignore` and a redacted secret scan before every credential-bearing integration |

## Current boundary

Real today: iPad microphone capture, HTTPS transport, frontend interaction, recording
recovery, HTTP orchestration, and temporary Cloudflare tunneling.

Mocked today: permanent audio storage, transcription content, interview decisions,
database persistence, and interviewer voice. The existing live adapters are code paths,
not yet verified integrations.

