import assert from "node:assert/strict";
import test from "node:test";

process.env.APP_MODE = "mock";
process.env.PORT = "10001";
process.env.PUBLIC_API_URL = "http://127.0.0.1:10001";
const { server } = await import("../dist/server.js");
const {
  CHRONOLOGY_STATUSES,
  CONTEXT_OPPORTUNITIES,
  INTERVIEW_DIRECTOR_SCHEMA,
  QUESTION_WRITER_SCHEMA,
  decideNextTurn,
  directNextTurn,
  writeNextQuestion,
} = await import("../dist/openaiInterview.js");
const { INTERVIEW_DIRECTOR_INSTRUCTIONS, QUESTION_WRITER_INSTRUCTIONS } = await import("../dist/interviewPrompt.js");
const api = "http://127.0.0.1:10001";

test.after(() => new Promise((resolve) => server.close(() => resolve())));

function historyTurn(args, decision) {
  return {
    question: args.currentQuestion,
    answer: args.transcript,
    chronologyStatus: decision.chronology_status,
    currentLifePeriod: decision.current_life_period,
    currentTopic: decision.current_topic,
    storyThread: decision.story_thread,
    storyIsEmerging: decision.story_is_emerging,
  };
}

async function runSequence(initialQuestion, answers) {
  let currentQuestion = initialQuestion;
  const storyHistory = [];
  const results = [];
  for (const transcript of answers) {
    const args = { currentQuestion, transcript, storyHistory };
    const direction = await directNextTurn(args);
    const writer = await writeNextQuestion(args, direction);
    const decision = await decideNextTurn(args);
    assert.equal(writer.next_question, decision.next_question);
    results.push({ args, direction, decision });
    storyHistory.push(historyTurn(args, decision));
    currentQuestion = decision.next_question;
  }
  return results;
}

const vagueQuestion = /what do you remember about|what else do you remember|what stands out to you about|what was .+ like for you|tell me more|your involvement|your relationship with/i;

test("app questions and commands bypass story-question generation", async () => {
  const currentQuestion = "What happened next?";
  const questionArgs = { currentQuestion, transcript: "What year was the moon landing?", storyHistory: [] };
  const questionDirection = await directNextTurn(questionArgs);
  const question = await decideNextTurn(questionArgs);
  assert.equal(questionDirection.interview_intent, "app_question");
  assert.equal(question.interview_intent, "app_question");
  assert.equal(question.intent, "app_question");
  assert.equal(question.next_question, currentQuestion);

  const commandArgs = { currentQuestion, transcript: "Talk slower", storyHistory: [] };
  const commandDirection = await directNextTurn(commandArgs);
  const command = await decideNextTurn(commandArgs);
  assert.equal(commandDirection.interview_intent, "app_command");
  assert.equal(command.intent, "app_command");
  assert.equal(command.command?.name, "slower");
  assert.equal(command.next_question, currentQuestion);
});

test("boxing sequence anchors age and then opens a fight story", async () => {
  const results = await runSequence("What kinds of things did you do when you were young?", [
    "I used to box when I was a kid.",
    "I was about twelve.",
    "My brother got me into it.",
    "I fought a few times.",
    "Yeah, there was one fight at the YMCA.",
  ]);

  assert.equal(results[0].direction.context_opportunity, "need_age");
  assert.equal(results[0].direction.approx_age_known, false);
  assert.match(results[0].direction.question_objective, /establish.*how old/i);
  assert.equal(results[0].decision.next_question, "How old were you when you started boxing?");

  assert.equal(results[1].direction.approx_age_known, true);
  assert.match(results[1].direction.question_objective, /first got into boxing/i);
  assert.equal(results[1].decision.next_question, "How did you first get into boxing?");

  assert.equal(results[2].direction.story_is_emerging, true);
  assert.match(results[2].direction.story_thread, /brother.*boxing/i);
  assert.equal(results[2].decision.next_question, "How did your brother get you started?");

  assert.equal(results[3].direction.story_is_emerging, true);
  assert.match(results[3].direction.question_objective, /particular fight/i);
  assert.equal(results[3].decision.next_question, "Any fights you still remember?");

  assert.equal(results[4].direction.story_is_emerging, true);
  assert.match(results[4].direction.story_thread, /specific fight.*YMCA/i);
  assert.equal(results[4].decision.next_question, "What happened in that fight?");

  for (const { decision } of results) assert.doesNotMatch(decision.next_question, vagueQuestion);
});

test("first job sequence anchors chronology and opens how it began", async () => {
  const results = await runSequence("What came next as you got older?", [
    "My first job was at a neighborhood market.",
    "I was sixteen.",
    "My aunt introduced me to the owner.",
  ]);
  assert.equal(results[0].direction.context_opportunity, "need_age");
  assert.equal(results[0].decision.next_question, "How old were you when you started that job?");
  assert.equal(results[1].decision.next_question, "How did you get that job?");
  assert.equal(results[2].direction.story_is_emerging, true);
  assert.equal(results[2].decision.next_question, "How did that lead to you getting the job?");
  for (const { decision } of results) assert.doesNotMatch(decision.next_question, vagueQuestion);
});

test("move sequence anchors age and develops the transition", async () => {
  const results = await runSequence("What changed around that time?", [
    "We moved to Denver.",
    "I was about ten.",
    "My father was transferred there for work.",
  ]);
  assert.equal(results[0].direction.place_known, true);
  assert.equal(results[0].direction.context_opportunity, "need_age");
  assert.equal(results[0].decision.next_question, "About how old were you when you moved?");
  assert.equal(results[1].decision.next_question, "What led to the move?");
  assert.equal(results[2].direction.chronology_status, "transitioning");
  assert.equal(results[2].direction.story_is_emerging, true);
  assert.equal(results[2].decision.next_question, "What happened next with the move?");
  for (const { decision } of results) assert.doesNotMatch(decision.next_question, vagueQuestion);
});

test("military sequence anchors age and follows the decision into action", async () => {
  const results = await runSequence("What happened after school?", [
    "I joined the Army.",
    "I was eighteen.",
    "I volunteered after talking with a friend.",
  ]);
  assert.equal(results[0].decision.next_question, "How old were you when you joined?");
  assert.equal(results[1].decision.next_question, "What led you to join?");
  assert.equal(results[2].direction.story_is_emerging, true);
  assert.equal(results[2].decision.next_question, "What happened when you entered the service?");
  for (const { decision } of results) assert.doesNotMatch(decision.next_question, vagueQuestion);
});

test("meeting a spouse sequence anchors age and opens the meeting scene", async () => {
  const results = await runSequence("What was happening in your life then?", [
    "That was when I met my wife.",
    "I was about twenty-four.",
    "We met at a dance.",
  ]);
  assert.equal(results[0].decision.next_question, "About how old were you when you met?");
  assert.equal(results[1].decision.next_question, "How did you meet?");
  assert.equal(results[2].direction.story_is_emerging, true);
  assert.equal(results[2].decision.next_question, "What happened when you met?");
  for (const { decision } of results) assert.doesNotMatch(decision.next_question, vagueQuestion);
});

test("childhood activity sequence anchors age and follows how it began", async () => {
  const results = await runSequence("What did you do for fun?", [
    "I built model airplanes.",
    "I started when I was nine.",
    "My grandfather showed me how.",
  ]);
  assert.equal(results[0].decision.next_question, "About how old were you when you started?");
  assert.equal(results[1].decision.next_question, "How did you first get into it?");
  assert.equal(results[2].direction.story_is_emerging, true);
  assert.equal(results[2].decision.next_question, "How did that get started?");
  for (const { decision } of results) assert.doesNotMatch(decision.next_question, vagueQuestion);
});

test("Director ignores incidental nouns and follows narrative action", async () => {
  const cases = [
    {
      answer: "My mom was cooking dinner, my dad was watching a ball game, and my brother and I were looking at snow-covered mountains.",
      forbidden: /dinner|ball game|mountains/i,
    },
    {
      answer: "We drove all night in my uncle's blue Ford.",
      forbidden: /ford|car|vehicle/i,
    },
  ];
  for (const example of cases) {
    const args = { currentQuestion: "What was happening around that time?", transcript: example.answer, storyHistory: [] };
    const direction = await directNextTurn(args);
    const decision = await decideNextTurn(args);
    assert.doesNotMatch(direction.question_objective, example.forbidden);
    assert.doesNotMatch(decision.next_question, example.forbidden);
    assert.doesNotMatch(decision.next_question, vagueQuestion);
  }
});

test("Director schema is compact and cannot generate question wording", () => {
  assert.equal(Object.hasOwn(INTERVIEW_DIRECTOR_SCHEMA.properties, "next_question"), false);
  assert.deepEqual(INTERVIEW_DIRECTOR_SCHEMA.properties.chronology_status.enum, CHRONOLOGY_STATUSES);
  assert.deepEqual(INTERVIEW_DIRECTOR_SCHEMA.properties.context_opportunity.enum, CONTEXT_OPPORTUNITIES);
  for (const field of [
    "interview_intent", "chronology_status", "approx_age_known", "approx_year_known", "place_known",
    "current_life_period", "current_topic", "story_is_emerging", "story_thread", "director_note",
    "question_objective", "should_advance", "context_opportunity",
  ]) assert.ok(INTERVIEW_DIRECTOR_SCHEMA.required.includes(field));
  assert.deepEqual(QUESTION_WRITER_SCHEMA.required, ["next_question", "contains_unstated_personal_fact", "assumption_explanation"]);
  assert.match(INTERVIEW_DIRECTOR_INSTRUCTIONS, /understand a life, not extract keywords/i);
  assert.match(INTERVIEW_DIRECTOR_INSTRUCTIONS, /MUST NOT write, draft, suggest, or return the final question/);
  assert.match(INTERVIEW_DIRECTOR_INSTRUCTIONS, /Strongly favor establishing time/);
  assert.match(INTERVIEW_DIRECTOR_INSTRUCTIONS, /stop following a predetermined checklist/i);
  assert.match(QUESTION_WRITER_INSTRUCTIONS, /may not change the selected subject or objective/i);
  assert.match(QUESTION_WRITER_INSTRUCTIONS, /usually in one short sentence/i);
});

test("question to durable upload to transcript to next question remains idempotent", async () => {
  const bootstrap = await fetch(`${api}/api/dev/bootstrap`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Test" }) });
  assert.equal(bootstrap.status, 200);
  const { session } = await bootstrap.json();
  const begin = await fetch(`${api}/api/turns/begin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: session.id, contentType: "audio/webm" }) });
  const turn = await begin.json();
  assert.equal(begin.status, 200);
  const upload = await fetch(turn.uploadUrl, { method: "PUT", headers: { "content-type": "audio/webm" }, body: new Uint8Array([1, 2, 3, 4]) });
  assert.equal(upload.status, 200);
  const first = await fetch(`${api}/api/turns/${turn.turnId}/process`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(first.status, 200);
  const result = await first.json();
  assert.equal(result.decision.interview_intent, "story_answer");
  assert.equal(result.decision.intent, "story_answer");
  assert.ok(result.decision.director_note);
  assert.ok(result.decision.question_objective);
  const retry = await fetch(`${api}/api/turns/${turn.turnId}/process`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
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
