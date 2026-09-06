import assert from "node:assert/strict";
import test from "node:test";

process.env.APP_MODE = "mock";
process.env.PORT = "10001";
process.env.PUBLIC_API_URL = "http://127.0.0.1:10001";
const { server } = await import("../dist/server.js");
const { decideNextTurn, INTERVIEW_DECISION_SCHEMA, QUESTION_STRATEGIES } = await import("../dist/openaiInterview.js");
const { INTERVIEW_INSTRUCTIONS } = await import("../dist/interviewPrompt.js");
const api = "http://127.0.0.1:10001";

test.after(() => new Promise((resolve) => server.close(() => resolve())));

test("interview contract preserves interrupted question", async () => {
  const currentQuestion = "What comes back to you first?";
  const question = await decideNextTurn({ currentQuestion, transcript: "What year was the moon landing?", storyHistory: [] });
  assert.equal(question.intent, "app_question");
  assert.equal(question.next_question, currentQuestion);
  assert.equal(question.strategy, "clarify_fact");
  const command = await decideNextTurn({ currentQuestion, transcript: "Talk slower", storyHistory: [] });
  assert.equal(command.intent, "app_command");
  assert.equal(command.next_question, currentQuestion);
  assert.equal(command.strategy, "clarify_fact");
  const story = await decideNextTurn({ currentQuestion, transcript: "I remember a garden.", storyHistory: [] });
  assert.equal(story.intent, "story_answer");
  assert.equal(story.speak_text, story.next_question);
  assert.equal(story.contains_unstated_personal_fact, false);
  assert.ok(QUESTION_STRATEGIES.includes(story.strategy));
  assert.ok(story.strategy_reason.length > 0);
});

test("question strategy follows narrative movement instead of incidental nouns", async () => {
  const cases = [
    {
      answer: "My mom was cooking dinner, my dad was watching a ball game, and my brother and I were looking out the windows at the snow-covered mountains.",
      strategy: "deepen_scene",
      forbidden: /windows/i,
    },
    {
      answer: "We moved to Arizona when I was about ten, and I started at a new school.",
      strategy: "transition_milestone",
      forbidden: /moving truck|house|school/i,
    },
    {
      answer: "I worked there for three years and then joined the Army.",
      strategy: "cause_and_effect",
      forbidden: /previous workplace/i,
    },
  ];

  for (const example of cases) {
    const decision = await decideNextTurn({
      currentQuestion: "What happened during that part of your life?",
      transcript: example.answer,
      storyHistory: [],
    });
    assert.equal(decision.intent, "story_answer");
    assert.equal(decision.strategy, example.strategy);
    assert.equal(decision.speak_text, decision.next_question);
    assert.ok(decision.strategy_reason.length > 0);
    assert.doesNotMatch(decision.next_question, example.forbidden);
    assert.doesNotMatch(decision.next_question, /^(what (else )?do you remember about|tell me more about)/i);
  }
});

test("question strategy uses recent history to avoid repeating the same default strategy", async () => {
  const decision = await decideNextTurn({
    currentQuestion: "What happened next?",
    transcript: "That was an important part of the story.",
    storyHistory: [{ question: "What happened before that?", answer: "We kept going.", strategy: "continue_timeline" }],
  });
  assert.notEqual(decision.strategy, "continue_timeline");
});

test("strict interview prompt names every strategy and guards against noun chasing", () => {
  for (const strategy of QUESTION_STRATEGIES) assert.match(INTERVIEW_INSTRUCTIONS, new RegExp(strategy));
  assert.match(INTERVIEW_INSTRUCTIONS, /Follow the story, not the keywords/);
  assert.match(INTERVIEW_INSTRUCTIONS, /Do not over-interrogate incidental/);
  assert.deepEqual(INTERVIEW_DECISION_SCHEMA.properties.strategy.enum, QUESTION_STRATEGIES);
  assert.ok(INTERVIEW_DECISION_SCHEMA.required.includes("strategy"));
  assert.ok(INTERVIEW_DECISION_SCHEMA.required.includes("strategy_reason"));
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
  const audio = await fetch(`${api}/api/turns/${turn.turnId}/audio?sessionId=${session.id}`);
  assert.equal(audio.status, 200);
  const audioResult = await audio.json();
  assert.equal(audioResult.byteLength, 4);
  assert.equal(audioResult.contentType, "audio/webm");
  assert.match(audioResult.url, /^mock:\/\//);
});

