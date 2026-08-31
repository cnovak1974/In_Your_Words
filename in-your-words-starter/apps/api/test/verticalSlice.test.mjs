import assert from "node:assert/strict";
import test from "node:test";

process.env.APP_MODE = "mock";
process.env.PORT = "10000";
const { server } = await import("../dist/server.js");
const { decideNextTurn } = await import("../dist/openaiInterview.js");
const api = "http://127.0.0.1:10000";

test.after(() => new Promise((resolve) => server.close(() => resolve())));

test("interview contract preserves interrupted question", async () => {
  const currentQuestion = "What comes back to you first?";
  const question = await decideNextTurn({ currentQuestion, transcript: "What year was the moon landing?", storyHistory: [] });
  assert.equal(question.intent, "app_question");
  assert.equal(question.next_question, currentQuestion);
  const command = await decideNextTurn({ currentQuestion, transcript: "Talk slower", storyHistory: [] });
  assert.equal(command.intent, "app_command");
  assert.equal(command.next_question, currentQuestion);
  const story = await decideNextTurn({ currentQuestion, transcript: "I remember a garden.", storyHistory: [] });
  assert.equal(story.intent, "story_answer");
  assert.equal(story.speak_text, story.next_question);
  assert.equal(story.contains_unstated_personal_fact, false);
});

test("question to durable upload to transcript to next question is idempotent", async () => {
  const bootstrap = await fetch(`${api}/api/dev/bootstrap`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({name:"Test"}) });
  assert.equal(bootstrap.status, 200);
  const { session } = await bootstrap.json();
  const begin = await fetch(`${api}/api/turns/begin`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({sessionId:session.id,contentType:"audio/webm"}) });
  const turn = await begin.json();
  assert.equal(begin.status, 200);
  const upload = await fetch(turn.uploadUrl, { method:"PUT", headers:{"content-type":"audio/webm"}, body:new Uint8Array([1,2,3,4]) });
  assert.equal(upload.status, 200);
  const first = await fetch(`${api}/api/turns/${turn.turnId}/process`, { method:"POST", headers:{"content-type":"application/json"}, body:"{}" });
  assert.equal(first.status, 200);
  const result = await first.json();
  assert.equal(result.decision.intent, "story_answer");
  const retry = await fetch(`${api}/api/turns/${turn.turnId}/process`, { method:"POST", headers:{"content-type":"application/json"}, body:"{}" });
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), result);
  const resumed = await fetch(`${api}/api/sessions/${session.id}`);
  assert.equal((await resumed.json()).current_question, result.decision.next_question);
});
