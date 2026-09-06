import assert from "node:assert/strict";
import test from "node:test";

process.env.APP_MODE = "mock";
process.env.PORT = "10001";
process.env.PUBLIC_API_URL = "http://127.0.0.1:10001";
const { server } = await import("../dist/server.js");
const { decideNextTurn, INTERVIEW_DECISION_SCHEMA, NARRATIVE_STATES, QUESTION_STRATEGIES } = await import("../dist/openaiInterview.js");
const { INTERVIEW_INSTRUCTIONS } = await import("../dist/interviewPrompt.js");
const api = "http://127.0.0.1:10001";

test.after(() => new Promise((resolve) => server.close(() => resolve())));

test("interview contract preserves interrupted question", async () => {
  const currentQuestion = "What comes back to you first?";
  const question = await decideNextTurn({ currentQuestion, transcript: "What year was the moon landing?", storyHistory: [] });
  assert.equal(question.intent, "app_question");
  assert.equal(question.next_question, currentQuestion);
  assert.equal(question.strategy, "clarify_fact");
  assert.equal(question.interview_goal, "resume the interrupted interview question");
  const command = await decideNextTurn({ currentQuestion, transcript: "Talk slower", storyHistory: [] });
  assert.equal(command.intent, "app_command");
  assert.equal(command.next_question, currentQuestion);
  assert.equal(command.strategy, "clarify_fact");
  assert.equal(command.interview_goal, "resume the interrupted interview question");
  const story = await decideNextTurn({ currentQuestion, transcript: "I remember a garden.", storyHistory: [] });
  assert.equal(story.intent, "story_answer");
  assert.equal(story.speak_text, story.next_question);
  assert.equal(story.contains_unstated_personal_fact, false);
  assert.ok(QUESTION_STRATEGIES.includes(story.strategy));
  assert.ok(story.strategy_reason.length > 0);
});

test("generated questions follow narrative movement instead of incidental nouns", async () => {
  const cases = [
    {
      answer: "My mom was cooking dinner, my dad was watching a ball game, and my brother and I were looking at snow-covered mountains.",
      strategy: "deepen_scene",
      narrativeState: "scene_developing",
      expectedQuestion: "What were evenings like for your family around that time?",
      forbidden: /mountains|ball game|cooking|dinner/i,
    },
    {
      answer: "We moved to Arizona when I was about ten, and I started at a new school.",
      strategy: "transition_milestone",
      narrativeState: "transition_open",
      expectedQuestion: "How did life change after the move?",
      forbidden: /moving truck|house|school/i,
    },
    {
      answer: "I worked there for three years and then joined the Army.",
      strategy: "cause_and_effect",
      narrativeState: "transition_open",
      expectedQuestion: "What led up to joining the Army?",
      forbidden: /workplace|three years/i,
    },
    {
      answer: "We drove all night in my uncle's blue Ford.",
      strategy: "continue_timeline",
      narrativeState: "timeline_gap",
      expectedQuestion: "What happened when you got where you were going?",
      forbidden: /blue Ford|Ford|vehicle/i,
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
    assert.equal(decision.narrative_state, example.narrativeState);
    assert.equal(decision.next_question, example.expectedQuestion);
    assert.equal(decision.speak_text, decision.next_question);
    assert.ok(decision.strategy_reason.length > 0);
    assert.ok(decision.interview_goal.length > 0);
    assert.ok(decision.thread_to_follow.split(/\s+/).length > 1);
    assert.doesNotMatch(decision.next_question, example.forbidden);
    assert.doesNotMatch(decision.next_question, /^(what (else )?do you remember about|tell me more about)/i);
  }
});

test("a third detail question advances beyond the established scene", async () => {
  const decision = await decideNextTurn({
    currentQuestion: "What was happening around you?",
    transcript: "My mom was cooking dinner and my dad was watching a ball game.",
    storyHistory: [
      { question: "What could you see from there?", answer: "There were snow-covered mountains.", strategy: "sensory_recall" },
      { question: "Who was there with you?", answer: "My parents and my brother.", strategy: "relationship_context" },
    ],
  });
  assert.equal(decision.narrative_state, "scene_exhausted");
  assert.equal(decision.should_advance, true);
  assert.equal(decision.strategy, "continue_timeline");
  assert.equal(decision.next_question, "What happened next in that period of your life?");
  assert.doesNotMatch(decision.next_question, /mom|dad|dinner|ball game|mountains/i);
});

test("strict interview prompt names every strategy and guards against noun chasing", () => {
  for (const strategy of QUESTION_STRATEGIES) assert.match(INTERVIEW_INSTRUCTIONS, new RegExp(strategy));
  assert.match(INTERVIEW_INSTRUCTIONS, /Follow the story, not the keywords/);
  assert.match(INTERVIEW_INSTRUCTIONS, /Do not over-interrogate incidental/);
  assert.deepEqual(INTERVIEW_DECISION_SCHEMA.properties.strategy.enum, QUESTION_STRATEGIES);
  assert.deepEqual(INTERVIEW_DECISION_SCHEMA.properties.narrative_state.enum, NARRATIVE_STATES);
  for (const field of ["strategy", "strategy_reason", "narrative_state", "interview_goal", "thread_to_follow", "thread_is_incidental", "should_advance"]) {
    assert.ok(INTERVIEW_DECISION_SCHEMA.required.includes(field));
  }
  const propertyOrder = Object.keys(INTERVIEW_DECISION_SCHEMA.properties);
  assert.ok(propertyOrder.indexOf("narrative_state") < propertyOrder.indexOf("strategy"));
  assert.ok(propertyOrder.indexOf("should_advance") < propertyOrder.indexOf("strategy"));
  assert.ok(propertyOrder.indexOf("strategy") < propertyOrder.indexOf("next_question"));
  assert.match(INTERVIEW_INSTRUCTIONS, /REQUIRED REASONING ORDER/);
  assert.match(INTERVIEW_INSTRUCTIONS, /diagnostic fields are decisions, not post-hoc explanations/);
  assert.match(INTERVIEW_INSTRUCTIONS, /may not become the subject of next_question solely because it appeared/);
  assert.match(INTERVIEW_INSTRUCTIONS, /If two consecutive questions both focused on details within the same scene/);
  assert.match(INTERVIEW_INSTRUCTIONS, /blue Ford/);
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

