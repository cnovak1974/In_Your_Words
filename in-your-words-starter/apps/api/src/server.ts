import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import { appMode, config } from "./config.js";
import { db, healthCheckDb } from "./db.js";
import { transcribeRemoteAudio } from "./deepgram.js";
import { synthesizeSpeech } from "./elevenlabs.js";
import { decideNextTurn } from "./openaiInterview.js";
import { confirmObject, createReadUrl, createUploadUrl, mockObjects } from "./storage.js";

const app = express();
app.use(cors({
  origin(origin, callback) {
    const allowed = !origin || origin === config.webOrigin ||
      (appMode === "mock" && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin));
    callback(allowed ? null : new Error("Origin is not allowed by CORS"), allowed);
  },
  exposedHeaders: ["X-TTS-Provider"],
}));
app.put("/api/mock/uploads/:key", express.raw({ type: "*/*", limit: "100mb" }), (req, res) => {
  if (appMode !== "mock") return res.sendStatus(404);
  mockObjects.set(decodeURIComponent(req.params.key), Buffer.from(req.body));
  res.sendStatus(200);
});
app.use(express.json({ limit: "1mb" }));

const INITIAL_QUESTION =
  "I'd like to start with your early years. Picture the place you think of as home when you were young—what comes back to you first?";

app.get("/health", async (_req, res) => {
  try {
    res.json({ ok: true, database: await healthCheckDb() });
  } catch (error) {
    res.status(503).json({ ok: false, error: String(error) });
  }
});

// First-slice bootstrap only. Replace with passwordless auth before broader family use.
app.post("/api/dev/bootstrap", async (req, res) => {
  if (!config.allowDevBootstrap) return res.status(404).json({ error: "Not found" });
  const name = String(req.body?.name ?? "Dad").trim().slice(0, 120) || "Dad";
  const client = await db.connect();
  try {
    await client.query("begin");
    const storyteller = await client.query(
      "insert into storytellers (display_name) values ($1) returning id, display_name",
      [name],
    );
    const session = await client.query(
      `insert into sessions (storyteller_id, current_question, status)
       values ($1, $2, 'active') returning id, current_question, status`,
      [storyteller.rows[0].id, INITIAL_QUESTION],
    );
    await client.query("commit");
    res.json({ storyteller: storyteller.rows[0], session: session.rows[0] });
  } catch (error) {
    await client.query("rollback");
    res.status(500).json({ error: String(error) });
  } finally {
    client.release();
  }
});

app.get("/api/sessions/:id", async (req, res) => {
  const result = await db.query(
    "select id, storyteller_id, current_question, status from sessions where id = $1",
    [req.params.id],
  );
  if (!result.rowCount) return res.status(404).json({ error: "Session not found" });
  res.json(result.rows[0]);
});

app.post("/api/turns/begin", async (req, res) => {
  const sessionId = String(req.body?.sessionId ?? "");
  const contentType = String(req.body?.contentType ?? "audio/webm");
  if (!sessionId) return res.status(400).json({ error: "sessionId is required" });

  const session = await db.query(
    "select id, storyteller_id, current_question from sessions where id = $1 and status = 'active'",
    [sessionId],
  );
  if (!session.rowCount) return res.status(404).json({ error: "Active session not found" });

  const turnId = crypto.randomUUID();
  const ext = contentType.includes("mp4") ? "m4a" : contentType.includes("ogg") ? "ogg" : "webm";
  const key = `storytellers/${session.rows[0].storyteller_id}/sessions/${sessionId}/turns/${turnId}.${ext}`;

  await db.query(
    `insert into turns (id, session_id, question_text, raw_audio_key, audio_content_type, status)
     values ($1, $2, $3, $4, $5, 'uploading')`,
    [turnId, sessionId, session.rows[0].current_question, key, contentType],
  );

  const uploadUrl = await createUploadUrl(key, contentType);
  res.json({ turnId, uploadUrl, contentType });
});

app.post("/api/turns/:id/process", async (req, res) => {
  const turn = await db.query(
    `select t.*, s.current_question, s.storyteller_id
     from turns t join sessions s on s.id = t.session_id where t.id = $1`,
    [req.params.id],
  );
  if (!turn.rowCount) return res.status(404).json({ error: "Turn not found" });

  const row = turn.rows[0];
  if (row.status === "complete" && row.ai_payload) return res.json({ transcript: row.transcript, decision: row.ai_payload });
  if (row.status === "processing") return res.status(409).json({ error: "Turn is already processing" });
  try {
    await confirmObject(row.raw_audio_key);
    await db.query("update turns set status='processing' where id=$1", [row.id]);
    const audioUrl = await createReadUrl(row.raw_audio_key);
    const transcript = await transcribeRemoteAudio(audioUrl);

    const historyResult = await db.query(
      `select question_text, transcript from turns
       where session_id=$1 and intent='story_answer' and transcript is not null and id <> $2
       order by created_at desc limit 50`,
      [row.session_id, row.id],
    );
    const storyHistory = historyResult.rows.reverse().map((r: { question_text: string; transcript: string }) => ({
      question: r.question_text,
      answer: r.transcript,
    }));

    const decision = await decideNextTurn({
      currentQuestion: row.current_question,
      transcript,
      storyHistory,
    });

    const client = await db.connect();
    try {
      await client.query("begin");
      await client.query(
        `update turns set transcript=$2, intent=$3, ai_payload=$4::jsonb, extracted_data=($4::jsonb->'entities'), status='complete', processed_at=now()
         where id=$1`,
        [row.id, transcript, decision.intent, JSON.stringify(decision)],
      );
      await client.query(
        "update sessions set current_question=$2, updated_at=now() where id=$1",
        [row.session_id, decision.next_question],
      );
      await client.query("commit");
    } catch (dbError) {
      await client.query("rollback");
      throw dbError;
    } finally {
      client.release();
    }

    res.json({ transcript, decision });
  } catch (error) {
    await db.query("update turns set status='failed', error_message=$2 where id=$1", [row.id, String(error)])
      .catch(() => undefined);
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/tts", async (req, res) => {
  const text = String(req.body?.text ?? "").trim();
  if (!text) return res.status(400).json({ error: "text is required" });
  if (text.length > 1500) return res.status(400).json({ error: "text too long" });
  try {
    const audio = await synthesizeSpeech(text);
    res.setHeader("Content-Type", appMode === "mock" ? "audio/wav" : "audio/mpeg");
    res.setHeader("X-TTS-Provider", appMode === "mock" ? "browser" : "elevenlabs");
    res.setHeader("Cache-Control", "no-store");
    res.send(Buffer.from(audio));
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "tts_failed", error: String(error) }));
    res.status(502).json({ error: String(error) });
  }
});

export const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(JSON.stringify({ level: "info", event: "server_started", port: config.port, mode: appMode }));
});

