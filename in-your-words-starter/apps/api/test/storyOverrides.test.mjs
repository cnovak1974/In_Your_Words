import assert from "node:assert/strict";
import test from "node:test";

const {
  analyzeStoryCorrection,
  createInterviewBookmark,
  detectStoryOverrideIntent,
  handleStoryOverride,
} = await import("../dist/storyOverrides.js");
const {
  createNewsreelCandidate,
  deriveNewsreelCandidate,
  invalidateNewsreelCandidates,
} = await import("../dist/newsreel.js");

const directorDecision = {
  intent: "story_answer",
  interview_intent: "story_answer",
  chronology_status: "anchored",
  approx_age_known: true,
  approx_year_known: true,
  place_known: true,
  current_life_period: "childhood",
  current_topic: "boxing",
  story_is_emerging: true,
  story_thread: "competitive boxing memories",
  director_note: "A specific boxing thread is open.",
  question_objective: "Invite a remembered fight.",
  followup_value: "high",
  followup_reason: "A fight may reveal a memorable event.",
  story_resolution_status: "developing",
  story_importance: "meaningful",
  current_thread_followup_count: 1,
  followup_budget: 3,
  followup_budget_remaining: 2,
  should_advance: false,
  context_opportunity: "date_place_ready",
  next_question: "Any fights that still stand out to you?",
  speak_text: "Any fights that still stand out to you?",
  contains_unstated_personal_fact: false,
  assumption_explanation: "",
  command: null,
  entities: { people: [], places: ["Reno, Nevada"], dates: [], organizations: [] },
};

const resumeDirectorState = {
  chronology_status: "anchored",
  current_life_period: "childhood",
  current_topic: "boxing",
  story_thread: "competitive boxing memories",
  story_is_emerging: true,
  story_resolution_status: "developing",
  story_importance: "meaningful",
  should_advance: false,
};

const storyTurns = [
  { id: "birth-turn", transcript: "I was born in 1946." },
  { id: "boxing-turn", transcript: "I started boxing when I was 12 in Reno, Nevada." },
  { id: "aunt-turn", transcript: "My aunt Mary drove me to practice." },
];

function readyCandidate() {
  return deriveNewsreelCandidate({
    turns: storyTurns,
    resumeQuestion: directorDecision.next_question,
    resumeThread: directorDecision.story_thread,
    resumeDirectorState,
  });
}

function bookmark(candidate = readyCandidate()) {
  return createInterviewBookmark({
    currentQuestion: directorDecision.next_question,
    priorDecision: directorDecision,
    newsreelCandidate: candidate,
  });
}

function handle(transcript, overrides = {}) {
  return handleStoryOverride({
    transcript,
    sourceTurnId: "correction-turn",
    storyTurns,
    currentQuestion: directorDecision.next_question,
    bookmark: bookmark(),
    now: "2026-09-07T20:00:00.000Z",
    ...overrides,
  });
}

test("direct factual correction creates a non-destructive supersession record", () => {
  const prior = [{ id: "shop-turn", transcript: "I said the shop opened at six." }];
  const result = handleStoryOverride({
    transcript: "I said the shop opened at six, but it opened at seven.",
    sourceTurnId: "correction-turn",
    storyTurns: prior,
    currentQuestion: directorDecision.next_question,
    bookmark: bookmark(),
    now: "2026-09-07T20:00:00.000Z",
  });
  assert.equal(result.intent, "story_correction");
  assert.equal(result.correction_record.status, "applied");
  assert.equal(result.correction_record.target_turn_id, "shop-turn");
  assert.equal(result.correction_record.original_value, "the shop opened at six");
  assert.equal(result.correction_record.corrected_value, "it opened at seven");
  assert.equal(prior[0].transcript, "I said the shop opened at six.");
});

test("correction without enough information enters clarification without planning", () => {
  const result = handle("I need to correct something I said earlier.");
  assert.equal(result.intent, "story_correction");
  assert.equal(result.correction_record.status, "pending_clarification");
  assert.equal(result.interaction.status, "awaiting_clarification");
  assert.equal(result.next_question, "What would you like to correct?");
  assert.deepEqual(result.accepted_story_facts, []);
});

test("multi-turn age correction applies after clarification", () => {
  const pending = handle("I need to correct something I said earlier.");
  const applied = handle("I said I was 12 when I started boxing, but I was actually 13.", {
    pendingInteraction: pending.interaction,
    currentQuestion: pending.next_question,
  });
  assert.equal(applied.correction_record.status, "applied");
  assert.equal(applied.correction_record.target_fact_path, "chronology.age");
  assert.equal(applied.correction_record.original_value, "12");
  assert.equal(applied.correction_record.corrected_value, "13");
  assert.equal(applied.interaction.interaction_id, pending.interaction.interaction_id);
  assert.equal(applied.next_question, directorDecision.next_question);
  assert.match(applied.speak_text, /corrected age.*Any fights that still stand out/i);
});

test("place correction identifies the prior place without erasing it", () => {
  const analysis = analyzeStoryCorrection("I said we lived in Reno then, but it was actually Sparks.", storyTurns);
  const concise = analyzeStoryCorrection("That wasn’t Reno, it was Sparks.", storyTurns);
  assert.equal(detectStoryOverrideIntent("That wasn’t Reno, it was Sparks."), "story_correction");
  assert.equal(analysis.correction_type, "place_correction");
  assert.equal(analysis.target_turn_id, "boxing-turn");
  assert.equal(analysis.target_fact_path, "place.city");
  assert.equal(analysis.original_value, "Reno");
  assert.equal(analysis.corrected_value, "Sparks");
  assert.equal(concise.status, "applied");
  assert.equal(concise.target_turn_id, "boxing-turn");
  assert.equal(concise.corrected_value, "Sparks");
  assert.match(storyTurns[1].transcript, /Reno/);
});

test("relationship and name corrections link only to matching source turns", () => {
  const relationship = analyzeStoryCorrection("She wasn't my aunt, she was actually my cousin.", storyTurns);
  const name = analyzeStoryCorrection("I said her name was Mary, but it was Marie.", storyTurns);
  assert.equal(relationship.target_turn_id, "aunt-turn");
  assert.equal(relationship.target_fact_path, "relationship.type");
  assert.equal(relationship.corrected_value, "cousin");
  assert.equal(name.target_turn_id, "aunt-turn");
  assert.equal(name.target_fact_path, "person.name");
  assert.equal(name.corrected_value, "Marie");
});

test("addendum waits for content, attaches it, and preserves the earlier statement", () => {
  const accidentTurns = [{ id: "accident-turn", transcript: "My dad fell into the lake and recovered." }];
  const started = handleStoryOverride({
    transcript: "I just remembered something else about my dad's accident.",
    sourceTurnId: "addendum-start",
    storyTurns: accidentTurns,
    currentQuestion: directorDecision.next_question,
    bookmark: bookmark(),
    now: "2026-09-07T20:00:00.000Z",
  });
  assert.equal(started.intent, "story_addendum");
  assert.equal(started.next_question, "Go ahead.");
  const completed = handleStoryOverride({
    transcript: "The doctor kept him overnight for observation.",
    sourceTurnId: "addendum-content",
    storyTurns: accidentTurns,
    currentQuestion: "Go ahead.",
    bookmark: bookmark(),
    pendingInteraction: started.interaction,
    now: "2026-09-07T20:01:00.000Z",
  });
  assert.equal(completed.addendum_record.target_turn_id, "accident-turn");
  assert.equal(completed.addendum_record.transcript, "The doctor kept him overnight for observation.");
  assert.equal(accidentTurns[0].transcript, "My dad fell into the lake and recovered.");
});

test("original transcript remains authoritative provenance after correction", () => {
  const before = structuredClone(storyTurns);
  const result = handle("I said I was 12 when I started boxing, but I was actually 13.");
  assert.deepEqual(storyTurns, before);
  assert.equal(result.correction_record.target_turn_id, "boxing-turn");
  assert.equal(result.correction_record.source_turn_id, "correction-turn");
  assert.equal(result.correction_record.correction_transcript, "I said I was 12 when I started boxing, but I was actually 13.");
});

test("latest accepted fact supersedes the prior accepted value while history remains in records", () => {
  const first = handle("I said I was 12 when I started boxing, but I was actually 13.");
  const second = handle("I said I was 13 when I started boxing, but I was actually 14.", {
    sourceTurnId: "second-correction",
    acceptedStoryFacts: first.accepted_story_facts,
  });
  assert.equal(first.correction_record.corrected_value, "13");
  assert.equal(second.correction_record.original_value, "13");
  assert.equal(second.accepted_story_facts.length, 1);
  assert.equal(second.accepted_story_facts[0].value, "14");
  assert.equal(second.accepted_story_facts[0].supersedes_value, "13");
});

test("current interview question and thread survive a correction", () => {
  const result = handle("I said I was 12 when I started boxing, but I was actually 13.");
  assert.equal(result.next_question, directorDecision.next_question);
  assert.equal(result.interaction.bookmark.current_interview_thread, directorDecision.story_thread);
  assert.equal(result.interaction.bookmark.current_question, directorDecision.next_question);
});

test("a correction flags an active question only when its old fact makes that question invalid", () => {
  const placeBookmark = createInterviewBookmark({
    currentQuestion: "What was Reno like for your family then?",
    priorDecision: { ...directorDecision, next_question: "What was Reno like for your family then?" },
    newsreelCandidate: readyCandidate(),
  });
  const result = handleStoryOverride({
    transcript: "I said we lived in Reno then, but it was actually Sparks.",
    sourceTurnId: "place-correction",
    storyTurns,
    currentQuestion: placeBookmark.current_question,
    bookmark: placeBookmark,
  });
  assert.equal(result.question_invalidated, true);
});

test("follow-up count and budget are unchanged by correction", () => {
  const result = handle("I said I was 12 when I started boxing, but I was actually 13.");
  assert.deepEqual(result.interaction.bookmark.followup_budget_state, {
    current_thread_followup_count: 1,
    followup_budget: 3,
    followup_budget_remaining: 2,
  });
});

test("age correction invalidates the stale Newsreel key and derives 1959", () => {
  const oldCandidate = readyCandidate();
  const result = handle("I said I was 12 when I started boxing, but I was actually 13.");
  const fact = result.accepted_story_facts[0];
  const current = deriveNewsreelCandidate({
    turns: storyTurns,
    previousCandidates: [oldCandidate],
    resumeQuestion: result.next_question,
    resumeThread: directorDecision.story_thread,
    resumeDirectorState,
    factOverrides: [{ sourceTurnId: fact.source_turn_id, targetTurnId: fact.target_turn_id, factPath: fact.fact_path, value: fact.value }],
  });
  const invalidated = invalidateNewsreelCandidates({ candidates: [oldCandidate], targetTurnId: fact.target_turn_id, currentContextKey: current.context_key });
  assert.equal(oldCandidate.context_key, "reno-nv|1958");
  assert.equal(current.context_key, "reno-nv|1959");
  assert.equal(invalidated[0].status, "invalidated");
});

test("place correction invalidates Reno and derives Sparks without changing the region", () => {
  const oldCandidate = readyCandidate();
  const result = handle("I said we lived in Reno then, but it was actually Sparks.");
  const fact = result.accepted_story_facts[0];
  const current = deriveNewsreelCandidate({
    turns: storyTurns,
    previousCandidates: [oldCandidate],
    resumeQuestion: result.next_question,
    resumeThread: directorDecision.story_thread,
    resumeDirectorState,
    factOverrides: [{ sourceTurnId: fact.source_turn_id, targetTurnId: fact.target_turn_id, factPath: fact.fact_path, value: fact.value }],
  });
  const invalidated = invalidateNewsreelCandidates({ candidates: [oldCandidate], targetTurnId: fact.target_turn_id, currentContextKey: current.context_key });
  assert.equal(current.anchor.place, "Sparks, Nevada");
  assert.equal(current.context_key, "sparks-nv|1958");
  assert.equal(invalidated[0].context_key, "reno-nv|1958");
  assert.equal(invalidated[0].status, "invalidated");
});

test("unresolved correction does not mutate accepted facts or derived context", () => {
  const oldCandidate = readyCandidate();
  const result = handle("I had the year wrong.");
  assert.notEqual(result.correction_record.status, "applied");
  assert.deepEqual(result.accepted_story_facts, []);
  assert.deepEqual(result.interaction.bookmark.newsreel_candidate, oldCandidate);
  assert.equal(result.context_changed, false);
});

test("normal app questions and commands are not captured by the override channel", () => {
  assert.equal(detectStoryOverrideIntent("What year was the moon landing?"), null);
  assert.equal(detectStoryOverrideIntent("Talk slower"), null);
  assert.equal(detectStoryOverrideIntent("I remember a garden behind the house."), null);
});

test("Newsreel candidates can be recreated without reviving invalidated duplicates", () => {
  const original = readyCandidate();
  const invalidated = { ...original, status: "invalidated", invalidated_at: "2026-09-07T20:00:00.000Z" };
  const recreated = createNewsreelCandidate({
    anchor: original.anchor,
    previousCandidates: [invalidated],
    resumeQuestion: directorDecision.next_question,
    resumeThread: directorDecision.story_thread,
    resumeDirectorState,
  });
  assert.equal(recreated.status, "ready");
  assert.notDeepEqual(recreated, invalidated);
});

