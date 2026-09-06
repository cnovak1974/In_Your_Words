import assert from "node:assert/strict";
import test from "node:test";

process.env.APP_MODE = "mock";
process.env.PORT = "10001";
process.env.PUBLIC_API_URL = "http://127.0.0.1:10001";
const { server } = await import("../dist/server.js");
const {
  decideNextTurn,
  planNextTurn,
  writeNextQuestion,
  INTERVIEW_PLANNER_SCHEMA,
  NARRATIVE_STATES,
  NEXT_MOVES,
  QUESTION_STRATEGIES,
  QUESTION_WRITER_SCHEMA,
} = await import("../dist/openaiInterview.js");
const { INTERVIEW_PLANNER_INSTRUCTIONS, QUESTION_WRITER_INSTRUCTIONS } = await import("../dist/interviewPrompt.js");
const api = "http://127.0.0.1:10001";

test.after(() => new Promise((resolve) => server.close(() => resolve())));

test("intent routing preserves interrupted app questions and commands", async () => {
  const currentQuestion = "What comes back to you first?";
  const questionArgs = { currentQuestion, transcript: "What year was the moon landing?", storyHistory: [] };
  const questionPlan = await planNextTurn(questionArgs);
  const question = await decideNextTurn(questionArgs);
  assert.equal(questionPlan.intent, "app_question");
  assert.equal(question.intent, "app_question");
  assert.equal(question.next_question, currentQuestion);
  assert.equal(question.strategy, "clarify_fact");

  const commandArgs = { currentQuestion, transcript: "Talk slower", storyHistory: [] };
  const commandPlan = await planNextTurn(commandArgs);
  const command = await decideNextTurn(commandArgs);
  assert.equal(commandPlan.intent, "app_command");
  assert.equal(command.intent, "app_command");
  assert.equal(command.next_question, currentQuestion);
  assert.equal(command.command?.name, "slower");
});

test("planner and writer reject isolated noun-chasing examples", async () => {
  const cases = [
    {
      answer: "My mom was cooking dinner, my dad was watching a ball game, and my brother and I were looking at snow-covered mountains.",
      expectedMove: "explore_relationship",
      expectedQuestion: "What were evenings like for your family around that time?",
      forbidden: /mountains|ball game|cooking|dinner/i,
    },
    {
      answer: "We moved to Arizona when I was about ten, and I started at a new school.",
      expectedMove: "transition_milestone",
      expectedQuestion: "How did life change after the move?",
      forbidden: /moving truck|house|school/i,
    },
    {
      answer: "I worked there for three years and then joined the Army.",
      expectedMove: "explore_decision",
      expectedQuestion: "What led up to joining the Army?",
      forbidden: /workplace|three years/i,
    },
    {
      answer: "We drove all night in my uncle's blue Ford.",
      expectedMove: "advance_event",
      expectedQuestion: "What happened when you got where you were going?",
      forbidden: /blue Ford|Ford|vehicle/i,
    },
  ];

  for (const example of cases) {
    const args = { currentQuestion: "What happened during that part of your life?", transcript: example.answer, storyHistory: [] };
    const plan = await planNextTurn(args);
    const writer = await writeNextQuestion(args, plan);
    const decision = await decideNextTurn(args);
    assert.equal(plan.intent, "story_answer");
    assert.equal(plan.next_move, example.expectedMove);
    assert.equal(writer.next_question, example.expectedQuestion);
    assert.equal(decision.next_question, example.expectedQuestion);
    assert.equal(decision.speak_text, decision.next_question);
    assert.doesNotMatch(plan.question_objective, example.forbidden);
    assert.doesNotMatch(decision.next_question, example.forbidden);
    assert.doesNotMatch(decision.next_question, /^(what (else )?do you remember|what stands out to you)/i);
  }
});

test("sequential childhood routine stays above incidental lexical details", async () => {
  const answers = [
    "I walked home from school every day.",
    "There were cars going by and a grocery store on the corner.",
    "When I got home my mother was usually making dinner.",
  ];
  let currentQuestion = "How did you usually get home from school?";
  const storyHistory = [];
  const results = [];

  for (const transcript of answers) {
    const args = { currentQuestion, transcript, storyHistory };
    const plan = await planNextTurn(args);
    const writer = await writeNextQuestion(args, plan);
    const decision = await decideNextTurn(args);
    assert.equal(writer.next_question, decision.next_question);
    results.push({ plan, decision });
    storyHistory.push({ question: currentQuestion, answer: transcript, strategy: decision.strategy });
    currentQuestion = decision.next_question;
  }

  assert.equal(results[1].plan.thread_is_incidental, true);
  assert.equal(results[1].plan.should_advance, true);
  assert.equal(results[1].plan.next_move, "advance_event");
  assert.equal(results[1].decision.next_question, "What usually happened when you got home?");
  assert.doesNotMatch(results[1].plan.thread_to_follow, /cars|grocery store/i);
  assert.doesNotMatch(results[1].plan.question_objective, /cars|grocery store/i);
  assert.doesNotMatch(results[1].decision.next_question, /cars|grocery store/i);

  assert.equal(results[2].plan.next_move, "explore_relationship");
  assert.equal(results[2].decision.next_question, "What was that time at home usually like for your family?");
  assert.doesNotMatch(results[2].plan.question_objective, /dinner/i);
  assert.doesNotMatch(results[2].decision.next_question, /dinner|cars|grocery store/i);
});

test("sequential draft notice planning follows the life transition", async () => {
  const firstArgs = { currentQuestion: "What kind of work were you doing?", transcript: "I worked at the shop for three years.", storyHistory: [] };
  const first = await decideNextTurn(firstArgs);
  const storyHistory = [{ question: firstArgs.currentQuestion, answer: firstArgs.transcript, strategy: first.strategy }];
  const secondArgs = { currentQuestion: first.next_question, transcript: "Then I got my draft notice.", storyHistory };
  const plan = await planNextTurn(secondArgs);
  const writer = await writeNextQuestion(secondArgs, plan);
  const decision = await decideNextTurn(secondArgs);

  assert.equal(plan.narrative_state, "transition_open");
  assert.equal(plan.should_advance, true);
  assert.equal(plan.next_move, "transition_milestone");
  assert.match(plan.thread_to_follow, /transition.*draft notice/i);
  assert.doesNotMatch(`${plan.thread_to_follow} ${plan.question_objective}`, /shop|tools|coworkers|uniforms|cars|buildings/i);
  assert.equal(writer.next_question, "What happened after you received the draft notice?");
  assert.equal(decision.next_question, writer.next_question);
  assert.doesNotMatch(decision.next_question, /shop|tools|coworkers|uniforms|cars|buildings/i);
});

test("a third detail question advances beyond the established scene", async () => {
  const args = {
    currentQuestion: "What was happening around you?",
    transcript: "My mom was cooking dinner and my dad was watching a ball game.",
    storyHistory: [
      { question: "What could you see from there?", answer: "There were snow-covered mountains.", strategy: "sensory_recall" },
      { question: "Who was there with you?", answer: "My parents and my brother.", strategy: "relationship_context" },
    ],
  };
  const plan = await planNextTurn(args);
  const decision = await decideNextTurn(args);
  assert.equal(plan.narrative_state, "scene_exhausted");
  assert.equal(plan.should_advance, true);
  assert.equal(plan.next_move, "advance_event");
  assert.equal(decision.next_question, "What happened next in that period of your life?");
  assert.doesNotMatch(decision.next_question, /mom|dad|dinner|ball game|mountains/i);
});

test("planner cannot generate a question and writer cannot revise the plan", () => {
  assert.equal(Object.hasOwn(INTERVIEW_PLANNER_SCHEMA.properties, "next_question"), false);
  assert.deepEqual(INTERVIEW_PLANNER_SCHEMA.properties.narrative_state.enum, NARRATIVE_STATES);
  assert.deepEqual(INTERVIEW_PLANNER_SCHEMA.properties.next_move.enum, NEXT_MOVES);
  assert.deepEqual(INTERVIEW_PLANNER_SCHEMA.properties.strategy.enum, QUESTION_STRATEGIES);
  for (const field of ["narrative_state", "interview_goal", "thread_to_follow", "thread_is_incidental", "should_advance", "story_position", "unfinished_business", "next_move", "question_objective"]) {
    assert.ok(INTERVIEW_PLANNER_SCHEMA.required.includes(field));
  }
  assert.deepEqual(QUESTION_WRITER_SCHEMA.required, ["next_question", "contains_unstated_personal_fact", "assumption_explanation"]);
  assert.deepEqual(Object.keys(QUESTION_WRITER_SCHEMA.properties), QUESTION_WRITER_SCHEMA.required);
  assert.match(INTERVIEW_PLANNER_INSTRUCTIONS, /MUST NOT write, draft, suggest, or return the wording of next_question/);
  assert.match(INTERVIEW_PLANNER_INSTRUCTIONS, /narrative trajectory, not lexical novelty/);
  assert.match(QUESTION_WRITER_INSTRUCTIONS, /NOT allowed to select a different thread, strategy, next move, or objective/);
  assert.match(QUESTION_WRITER_INSTRUCTIONS, /Do not promote any noun or detail from CURRENT_TRANSCRIPT/);
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
  assert.ok(result.decision.story_position);
  assert.ok(result.decision.question_objective);
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

