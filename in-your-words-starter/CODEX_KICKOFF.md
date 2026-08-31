# Codex kickoff prompt

Use this repository as the working codebase for **In Your Words**. Do not rewrite the architecture into a generic chatbot.

Your first goal is to make the existing vertical slice run end-to-end on a local machine and then deploy it with:
- React PWA frontend
- Node/Express API on Render
- Neon Postgres
- Cloudflare R2 private media bucket
- Deepgram Nova-3 transcription
- OpenAI Responses API for interview orchestration
- ElevenLabs generic TTS reader voice

The product contract is more important than UI polish:
1. One question at a time, large text, one large press-to-talk control.
2. Raw audio must reach R2 before transcription or LLM processing.
3. Retain raw audio and transcript separately.
4. The LLM must never invent/presuppose a personal fact. Use sensory/context reinstatement and open questions.
5. Story answers, app questions, and app commands are three separate intents. App questions/commands must not flow into story narrative data.
6. A factual app question resumes the exact question that was interrupted.
7. Do not add historical context, narrative chapters, contradiction resolution, voice cloning, newsreels, or video until the basic loop works reliably.
8. Keep vendor adapters isolated so Deepgram/ElevenLabs/OpenAI can be swapped later.

Tasks:
- Inspect every file before changing it.
- Run install/build/typecheck and fix all errors.
- Add database migration/setup scripts.
- Add API integration tests with mocked vendor calls and unit tests for the interview decision contract.
- Add idempotency to turn processing so a retry never creates duplicate content.
- Add upload confirmation/HEAD check before transcription.
- Make recording robust on current iPad/iPhone Safari MIME types.
- Preserve failed recordings locally until server confirmation when practical.
- Add structured logging without logging raw transcript content or API secrets.
- Add a README section with exact local setup and Render/Neon/R2 deployment steps.
- Do not add password auth yet; keep the dev bootstrap clearly isolated and impossible to enable accidentally in production.

When uncertain, choose the implementation that makes data loss less likely and the interview less suggestive.

