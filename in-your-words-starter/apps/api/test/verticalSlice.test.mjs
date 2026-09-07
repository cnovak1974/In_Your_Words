import assert from "node:assert/strict";
import test from "node:test";

process.env.APP_MODE = "mock";
process.env.PORT = "10001";
process.env.PUBLIC_API_URL = "http://127.0.0.1:10001";
const { server } = await import("../dist/server.js");
const {
  CHRONOLOGY_STATUSES,
  CHILDHOOD_DOMAINS,
  CONTEXT_OPPORTUNITIES,
  DOMAIN_STATUS_VALUES,
  FOLLOWUP_VALUES,
  INTERVIEW_DIRECTOR_SCHEMA,
  LIFE_DOMAIN_VALUES,
  LIFE_PERIOD_VALUES,
  QUESTION_WRITER_SCHEMA,
  STORY_IMPORTANCE_VALUES,
  STORY_RESOLUTION_STATUSES,
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
    followupValue: decision.followup_value,
    followupReason: decision.followup_reason,
    storyResolutionStatus: decision.story_resolution_status,
    storyImportance: decision.story_importance,
    currentThreadFollowupCount: decision.current_thread_followup_count,
    followupBudget: decision.followup_budget,
    followupBudgetRemaining: decision.followup_budget_remaining,
    shouldAdvance: decision.should_advance,
    lifePeriod: decision.life_period,
    currentDomain: decision.current_domain,
    domainStatus: decision.domain_status,
    domainGoal: decision.domain_goal,
    domainsCompleted: decision.domains_completed,
    domainsRemaining: decision.domains_remaining,
    shouldTransitionDomain: decision.should_transition_domain,
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
const genericResolvedContinuation = /what happened (?:right )?after that|what did you do after that|what happened next\??$/i;

function assertResolvedTransition(result) {
  assert.equal(result.direction.followup_value, "low");
  assert.equal(result.direction.story_resolution_status, "resolved");
  assert.equal(result.direction.should_advance, true);
  assert.equal(result.direction.followup_budget_remaining, 0);
  assert.doesNotMatch(result.decision.next_question, genericResolvedContinuation);
}

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
  assert.equal(results[0].direction.chronology_status, "needs_age_anchor");
  assert.equal(results[0].direction.approx_age_known, false);
  assert.equal(results[0].direction.story_is_emerging, true);
  assert.equal(results[0].direction.current_life_period, "childhood");
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

test("first job spends two useful follow-ups and then leaves the thread", async () => {
  const results = await runSequence("What came next as you got older?", [
    "My first job was at a neighborhood market when I was sixteen.",
    "My aunt introduced me to the owner.",
    "Learning to be dependable mattered most to me.",
  ]);
  assert.equal(results[0].direction.story_importance, "meaningful");
  assert.equal(results[0].direction.current_thread_followup_count, 0);
  assert.equal(results[0].direction.followup_budget, 2);
  assert.equal(results[0].direction.followup_budget_remaining, 2);
  assert.equal(results[0].decision.next_question, "How did you get that job?");
  assert.equal(results[1].direction.current_thread_followup_count, 1);
  assert.equal(results[1].direction.followup_budget_remaining, 1);
  assert.equal(results[1].decision.next_question, "What mattered most to you about that first job?");
  assertResolvedTransition(results[2]);
  assert.equal(results[2].decision.next_question, "What came next in your working life?");
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

test("childhood mischief permits one consequential follow-up and then advances", async () => {
  const results = await runSequence("What were you getting into as a child?", [
    "When I was twelve, a friend and I smoked cigarettes in the shed.",
    "I got sick, my parents caught me, and I was grounded.",
  ]);

  assert.equal(results[0].direction.story_importance, "minor");
  assert.equal(results[0].direction.current_thread_followup_count, 0);
  assert.equal(results[0].direction.followup_budget, 1);
  assert.equal(results[0].direction.followup_budget_remaining, 1);
  assert.equal(results[0].direction.story_resolution_status, "developing");
  assert.equal(results[0].direction.followup_value, "high");
  assert.match(results[0].direction.followup_reason, /consequence|conflict/i);
  assertResolvedTransition(results[1]);
  assert.doesNotMatch(results[1].decision.next_question, /grounded|how long|after that week/i);
  assert.equal(results[1].decision.next_question, "What came next in your childhood?");
});

test("father's lake accident gets two strong follow-ups, then skips logistics", async () => {
  const results = await runSequence("Was there a family event you remember clearly?", [
    "My dad fell into the lake and almost drowned.",
    "We pulled him out, took him to the hospital, and he recovered.",
    "No, after he came home things went back to normal for our family.",
  ]);

  assert.equal(results[0].direction.story_importance, "meaningful");
  assert.equal(results[0].direction.current_thread_followup_count, 0);
  assert.equal(results[0].direction.followup_budget, 2);
  assert.equal(results[0].direction.followup_budget_remaining, 2);
  assert.equal(results[0].decision.next_question, "How serious was your father's accident?");
  assert.equal(results[1].direction.current_thread_followup_count, 1);
  assert.equal(results[1].direction.followup_budget_remaining, 1);
  assert.equal(results[1].direction.story_resolution_status, "resolved");
  assert.equal(results[1].decision.next_question, "Did that accident change anything important for your family afterward?");
  assertResolvedTransition(results[2]);
  assert.equal(results[2].decision.next_question, "What came next for you after that?");
  for (const { decision } of results) {
    assert.doesNotMatch(decision.next_question, /sisters?|conversation|living arrangement|how did .* arrangement work/i);
  }
});

test("resolved trouble with parents gets one relationship check, not an interrogation", async () => {
  const results = await runSequence("Did you ever get into trouble when you were young?", [
    "I broke curfew, came home late, and my parents grounded me.",
    "No, it was settled after that.",
  ]);

  assert.equal(results[0].direction.story_resolution_status, "resolved");
  assert.equal(results[0].direction.followup_value, "medium");
  assert.match(results[0].direction.followup_reason, /parent relationship/i);
  assert.equal(results[0].decision.next_question, "Was that the first time you got into serious trouble with your parents?");
  assertResolvedTransition(results[1]);
  assert.doesNotMatch(results[1].decision.next_question, /curfew|grounded|parents|after that/i);
});

test("minor school incident advances after its outcome is known", async () => {
  const results = await runSequence("Was there a time you got in trouble at school?", [
    "I passed a note in class.",
    "The teacher caught me and I stayed after school.",
  ]);

  assert.equal(results[0].direction.story_resolution_status, "open");
  assert.equal(results[0].direction.followup_value, "high");
  assert.equal(results[0].decision.next_question, "What happened when you passed the note?");
  assertResolvedTransition(results[1]);
  assert.doesNotMatch(results[1].decision.next_question, /note|teacher|detention|stayed after/i);
});

test("first-job anecdote asks once about consequence and then returns to working life", async () => {
  const results = await runSequence("Did anything memorable happen at your first job?", [
    "I dropped a tray of glasses, everyone laughed, and my boss helped me clean it up.",
    "I was more careful, but that was really it.",
  ]);

  assert.equal(results[0].direction.story_resolution_status, "resolved");
  assert.equal(results[0].direction.followup_value, "medium");
  assert.match(results[0].direction.followup_reason, /behavior-change|lasting consequence/i);
  assert.equal(results[0].decision.next_question, "Did that change how you approached the job?");
  assertResolvedTransition(results[1]);
  assert.doesNotMatch(results[1].decision.next_question, /tray|glasses|boss|mishap/i);
});

test("resolved sports memory asks once about significance and then leaves the event", async () => {
  const results = await runSequence("Is there a sports memory that stayed with you?", [
    "In the championship game I scored the winning basket and we celebrated afterward.",
    "It meant a lot to me, but after that the season was over.",
  ]);

  assert.equal(results[0].direction.story_resolution_status, "resolved");
  assert.equal(results[0].direction.followup_value, "medium");
  assert.match(results[0].direction.followup_reason, /significance/i);
  assert.equal(results[0].decision.next_question, "What did winning that game mean to you then?");
  assertResolvedTransition(results[1]);
  assert.doesNotMatch(results[1].decision.next_question, /basket|game|celebrat/i);
});

test("major life event earns extra depth only for new high-value dimensions", async () => {
  const results = await runSequence("Was there an event that changed your life?", [
    "Our house burned down and we lost everything.",
    "We moved in with relatives, and I changed schools.",
    "My aunt became like a second mother, but I stopped speaking to my father for years.",
    "We reconciled years later after I called him.",
    "I wanted to make peace, and after that we were close until he died.",
  ]);

  assert.equal(results[0].direction.story_importance, "major");
  assert.equal(results[0].direction.followup_budget, 3);
  assert.equal(results[0].decision.next_question, "How did the fire change your life at that time?");
  assert.equal(results[1].direction.current_thread_followup_count, 1);
  assert.equal(results[1].direction.followup_value, "high");
  assert.equal(results[1].decision.next_question, "Did those changes affect your family relationships?");
  assert.equal(results[2].direction.current_thread_followup_count, 2);
  assert.match(results[2].direction.followup_reason, /relationship conflict|long-term impact/i);
  assert.equal(results[2].decision.next_question, "How did that period change your relationship with your father?");
  assert.equal(results[3].direction.current_thread_followup_count, 3);
  assert.equal(results[3].direction.followup_budget, 4);
  assert.equal(results[3].direction.followup_budget_remaining, 1);
  assert.match(results[3].direction.followup_reason, /decision|turning point/i);
  assert.equal(results[3].decision.next_question, "What led you to call your father?");
  assertResolvedTransition(results[4]);
  assert.equal(results[4].direction.followup_budget, 4);
  assert.equal(results[4].decision.next_question, "What was the next big change in your life?");
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

test("elementary school progresses broadly instead of mining one answer", async () => {
  const results = await runSequence("What was elementary school like for you?", [
    "I went to Lincoln Elementary.",
    "I was quiet but curious.",
    "I enjoyed science and reading.",
  ]);
  assert.equal(results[0].direction.current_domain, "elementary_school");
  assert.equal(results[0].direction.domain_status, "opening");
  assert.equal(results[0].decision.next_question, "What kind of student were you?");
  assert.equal(results[1].direction.domain_status, "developing");
  assert.equal(results[1].decision.next_question, "What classes did you enjoy?");
  assert.equal(results[2].direction.domain_status, "sufficient");
  assert.equal(results[2].direction.should_transition_domain, true);
  assert.equal(results[2].decision.next_question, "What were you into outside of school?");
});

test("middle school progresses from place to period to interests", async () => {
  const results = await runSequence("Where did you go to middle school?", [
    "I went to Roosevelt Middle School.",
    "It was a time when I became more independent.",
  ]);
  assert.equal(results[0].direction.life_period, "adolescence");
  assert.equal(results[0].direction.current_domain, "middle_school");
  assert.equal(results[0].decision.next_question, "What was that period like for you?");
  assert.equal(results[1].direction.domain_status, "developing");
  assert.equal(results[1].direction.should_transition_domain, true);
  assert.equal(results[1].decision.next_question, "What were you into then?");
});

test("high school progresses through broad student context", async () => {
  const results = await runSequence("Where did you go to high school?", [
    "I went to Central High.",
    "I was a serious student by then.",
    "I liked history and art.",
  ]);
  assert.equal(results[0].direction.current_domain, "high_school");
  assert.equal(results[0].decision.next_question, "What kind of student were you by then?");
  assert.equal(results[1].decision.next_question, "What classes did you like?");
  assert.equal(results[2].direction.domain_status, "sufficient");
  assert.equal(results[2].decision.next_question, "What were you into outside of school?");
});

test("school transitions naturally into a supplied sport or hobby", async () => {
  const results = await runSequence("What was elementary school like for you?", [
    "I went to Lincoln Elementary.",
    "I was an average student.",
    "I liked math.",
    "Outside school I played baseball.",
  ]);
  assert.equal(results[3].direction.current_domain, "sports");
  assert.equal(results[3].direction.domain_status, "opening");
  assert.equal(results[3].decision.next_question, "How did you first get into that?");
});

test("school transitions naturally into friends and social life", async () => {
  const results = await runSequence("What was elementary school like for you?", [
    "I went to Lincoln Elementary.",
    "I was fairly outgoing.",
    "I liked art class.",
    "Outside school I spent most of my time with friends from the neighborhood.",
  ]);
  assert.equal(results[3].direction.current_domain, "neighborhood_friends");
  assert.equal(results[3].decision.next_question, "What did you and your friends usually do together?");
});

test("home life becomes sufficient and transitions to school", async () => {
  const results = await runSequence("What was family life like when you were young?", [
    "I lived with my parents and two sisters.",
    "We ate together and everyone had chores.",
  ]);
  assert.equal(results[0].direction.current_domain, "home_family");
  assert.equal(results[0].decision.next_question, "What did everyday life at home look like for you?");
  assert.equal(results[1].direction.domain_status, "sufficient");
  assert.equal(results[1].direction.should_transition_domain, true);
  assert.equal(results[1].decision.next_question, "What was elementary school like for you?");
});

test("a school anecdote gets one useful follow-up and cannot trap the domain", async () => {
  const results = await runSequence("What was elementary school like for you?", [
    "I went to Lincoln Elementary.",
    "I passed a note, the teacher caught me, and I stayed after school.",
    "No, it did not change much about school for me.",
  ]);
  assert.equal(results[1].direction.current_domain, "elementary_school");
  assert.equal(results[1].direction.followup_budget, 1);
  assert.equal(results[1].decision.next_question, "Did that change anything about school for you?");
  assert.equal(results[2].direction.domain_status, "sufficient");
  assert.equal(results[2].direction.followup_budget_remaining, 0);
  assert.equal(results[2].decision.next_question, "What were you into outside of school?");
  assert.doesNotMatch(results[2].decision.next_question, /note|teacher|stayed after/i);
});

test("what were you into then opens a supplied activity domain", async () => {
  const results = await runSequence("What were you into then?", ["I played basketball after school."]);
  assert.equal(results[0].direction.current_domain, "sports");
  assert.equal(results[0].direction.domain_status, "opening");
  assert.equal(results[0].decision.next_question, "How did you first get into that?");
});

test("Director records completed and remaining domains when advancing", async () => {
  const results = await runSequence("What was elementary school like for you?", [
    "I went to Lincoln Elementary.",
    "I was a quiet student.",
    "I liked reading.",
  ]);
  const final = results[2].direction;
  assert.ok(final.domains_completed.includes("elementary_school"));
  assert.ok(final.domains_remaining.includes("interests_hobbies"));
  assert.equal(final.should_transition_domain, true);
});

test("an explicit chronological domain jump reorients without drifting backward", async () => {
  const results = await runSequence("What was elementary school like for you?", [
    "I went to Lincoln Elementary.",
    "By high school I was working at a grocery store.",
  ]);
  assert.equal(results[1].direction.life_period, "adolescence");
  assert.equal(results[1].direction.current_domain, "work");
  assert.match(results[1].direction.director_note, /explicitly moved|reorient/i);
  assert.equal(results[1].decision.next_question, "How did you get that job?");
  assert.doesNotMatch(results[1].decision.next_question, /elementary/i);
});

test("Director schema is compact and cannot generate question wording", () => {
  assert.equal(Object.hasOwn(INTERVIEW_DIRECTOR_SCHEMA.properties, "next_question"), false);
  assert.deepEqual(INTERVIEW_DIRECTOR_SCHEMA.properties.chronology_status.enum, CHRONOLOGY_STATUSES);
  assert.deepEqual(INTERVIEW_DIRECTOR_SCHEMA.properties.context_opportunity.enum, CONTEXT_OPPORTUNITIES);
  assert.deepEqual(INTERVIEW_DIRECTOR_SCHEMA.properties.followup_value.enum, FOLLOWUP_VALUES);
  assert.deepEqual(INTERVIEW_DIRECTOR_SCHEMA.properties.story_resolution_status.enum, STORY_RESOLUTION_STATUSES);
  assert.deepEqual(INTERVIEW_DIRECTOR_SCHEMA.properties.story_importance.enum, STORY_IMPORTANCE_VALUES);
  assert.deepEqual(INTERVIEW_DIRECTOR_SCHEMA.properties.life_period.enum, LIFE_PERIOD_VALUES);
  assert.deepEqual(INTERVIEW_DIRECTOR_SCHEMA.properties.current_domain.enum, LIFE_DOMAIN_VALUES);
  assert.deepEqual(INTERVIEW_DIRECTOR_SCHEMA.properties.domain_status.enum, DOMAIN_STATUS_VALUES);
  assert.deepEqual(CHILDHOOD_DOMAINS, ["home_family", "elementary_school", "neighborhood_friends", "interests_hobbies", "sports", "community", "moves_major_changes"]);
  assert.deepEqual(Object.keys(INTERVIEW_DIRECTOR_SCHEMA.properties), INTERVIEW_DIRECTOR_SCHEMA.required);
  assert.ok(Object.keys(INTERVIEW_DIRECTOR_SCHEMA.properties).indexOf("director_note") < Object.keys(INTERVIEW_DIRECTOR_SCHEMA.properties).indexOf("chronology_status"));
  for (const field of [
    "interview_intent", "chronology_status", "approx_age_known", "approx_year_known", "place_known",
    "current_life_period", "current_topic", "story_is_emerging", "story_thread", "director_note",
    "question_objective", "followup_value", "followup_reason", "story_resolution_status",
    "story_importance", "current_thread_followup_count", "followup_budget", "followup_budget_remaining",
    "should_advance", "context_opportunity", "life_period", "current_domain", "domain_status", "domain_goal",
    "domains_completed", "domains_remaining", "should_transition_domain",
  ]) assert.ok(INTERVIEW_DIRECTOR_SCHEMA.required.includes(field));
  assert.deepEqual(QUESTION_WRITER_SCHEMA.required, ["next_question", "contains_unstated_personal_fact", "assumption_explanation"]);
  assert.match(INTERVIEW_DIRECTOR_INSTRUCTIONS, /understand a life, not extract keywords/i);
  assert.match(INTERVIEW_DIRECTOR_INSTRUCTIONS, /Do not begin by filling classification fields/i);
  assert.match(INTERVIEW_DIRECTOR_INSTRUCTIONS, /categorical fields summarize and validate the decision; they must never generate it/i);
  assert.match(INTERVIEW_DIRECTOR_INSTRUCTIONS, /MUST NOT write, draft, suggest, or return the final question/);
  assert.match(INTERVIEW_DIRECTOR_INSTRUCTIONS, /Strongly favor establishing time/);
  assert.match(INTERVIEW_DIRECTOR_INSTRUCTIONS, /stop following a predetermined checklist/i);
  assert.match(INTERVIEW_DIRECTOR_INSTRUCTIONS, /Protect storyteller momentum/i);
  assert.match(INTERVIEW_DIRECTOR_INSTRUCTIONS, /"More detail" is not a valid reason/i);
  assert.match(INTERVIEW_DIRECTOR_INSTRUCTIONS, /If followup_value=low.*should_advance=true/i);
  assert.match(INTERVIEW_DIRECTOR_INSTRUCTIONS, /story_resolution_status=resolved.*do not keep mining/i);
  assert.match(INTERVIEW_DIRECTOR_INSTRUCTIONS, /Do not confuse completeness with quality/i);
  assert.match(INTERVIEW_DIRECTOR_INSTRUCTIONS, /budget is a ceiling, not a quota/i);
  assert.match(INTERVIEW_DIRECTOR_INSTRUCTIONS, /life period -> life domain -> broad opener/i);
  assert.match(INTERVIEW_DIRECTOR_INSTRUCTIONS, /A new anecdote inside a domain does not create a new domain or unlimited follow-up budget/i);
  assert.match(INTERVIEW_DIRECTOR_INSTRUCTIONS, /domain is sufficient/i);
  assert.match(INTERVIEW_DIRECTOR_INSTRUCTIONS, /followup_budget_remaining=0.*followup_value=low.*should_advance=true/i);
  assert.match(QUESTION_WRITER_INSTRUCTIONS, /may not change the selected subject or objective/i);
  assert.match(QUESTION_WRITER_INSTRUCTIONS, /followup_value=low or story_resolution_status=resolved/i);
  assert.match(QUESTION_WRITER_INSTRUCTIONS, /followup_budget_remaining=0 and story_resolution_status=resolved/i);
  assert.match(QUESTION_WRITER_INSTRUCTIONS, /usually in one short sentence/i);
  assert.match(QUESTION_WRITER_INSTRUCTIONS, /should_transition_domain=true/i);
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
  const resumedSession = await resumed.json();
  assert.equal(resumedSession.current_question, result.decision.next_question);
  assert.equal(resumedSession.context_ready, false);
  assert.deepEqual(resumedSession.context_missing, ["date", "place"]);
  assert.equal(resumedSession.newsreel_candidate.status, "not_ready");
  assert.equal(resumedSession.newsreel_candidate.resume_question, result.decision.next_question);
  const audio = await fetch(`${api}/api/turns/${turn.turnId}/audio?sessionId=${session.id}`);
  assert.equal(audio.status, 200);
  const audioResult = await audio.json();
  assert.equal(audioResult.byteLength, 4);
  assert.equal(audioResult.contentType, "audio/webm");
  assert.match(audioResult.url, /^mock:\/\//);
});
