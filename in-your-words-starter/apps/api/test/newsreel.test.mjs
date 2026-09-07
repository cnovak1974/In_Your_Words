import assert from "node:assert/strict";
import test from "node:test";

const {
  NEWSREEL_GROUNDING_RULES,
  NEWSREEL_SCRIPT_SCHEMA,
  NEWSREEL_SCRIPT_TARGET,
  assessContextEligibility,
  buildContextAnchor,
  contextKey,
  createNewsreelCandidate,
  deriveNewsreelCandidate,
  transitionNewsreelCandidate,
} = await import("../dist/newsreel.js");

const resumeDirectorState = {
  chronology_status: "anchored",
  current_life_period: "childhood",
  current_topic: "boxing",
  story_thread: "how boxing began",
  story_is_emerging: true,
  story_resolution_status: "developing",
  story_importance: "meaningful",
  should_advance: false,
};

function candidateFor(anchor, previousCandidates = []) {
  return createNewsreelCandidate({
    anchor,
    previousCandidates,
    resumeQuestion: "How did you first get into boxing?",
    resumeThread: "how boxing began",
    resumeDirectorState,
  });
}

test("exact year and place produce eligible normalized context", () => {
  const anchor = buildContextAnchor([{
    turnId: "turn-exact",
    year: 1962,
    dateConfidence: "exact",
    place: "Reno, Nevada",
    placeConfidence: "exact",
  }]);
  assert.equal(anchor.approx_year, 1962);
  assert.equal(anchor.date_confidence, "exact");
  assert.equal(anchor.place, "Reno, Nevada");
  assert.equal(anchor.place_confidence, "exact");
  assert.deepEqual(assessContextEligibility(anchor), { context_ready: true, context_missing: [] });
  assert.equal(contextKey(anchor), "reno-nv|1962");
});

test("birth year plus age derives an approximate year without inventing a date", () => {
  const anchor = buildContextAnchor([
    { turnId: "turn-birth", birthYear: 1946 },
    { turnId: "turn-boxing", age: 12, place: "Reno, Nevada", placeConfidence: "city_region" },
  ]);
  assert.equal(anchor.birth_year, 1946);
  assert.equal(anchor.age, 12);
  assert.equal(anchor.approx_year, 1958);
  assert.equal(anchor.year_start, null);
  assert.equal(anchor.year_end, null);
  assert.equal(anchor.date_confidence, "approx_year");
  assert.deepEqual(anchor.source_turn_ids.sort(), ["turn-birth", "turn-boxing"]);
  assert.equal(contextKey(anchor), "reno-nv|1958");
});

test("approximate age keeps a bounded uncertainty range around the derived year", () => {
  const anchor = buildContextAnchor([
    { turnId: "turn-birth", birthYear: 1946 },
    { turnId: "turn-age", age: 12, ageIsApproximate: true },
    { turnId: "turn-place", place: "Reno, Nevada", placeConfidence: "city_region" },
  ]);
  assert.equal(anchor.approx_year, 1958);
  assert.equal(anchor.year_start, 1957);
  assert.equal(anchor.year_end, 1959);
  assert.equal(anchor.date_confidence, "approx_year");
  assert.equal(contextKey(anchor), "reno-nv|1958");
});

test("explicit year range produces a stable range context key", () => {
  const anchor = buildContextAnchor([{
    turnId: "turn-range",
    yearStart: 1957,
    yearEnd: 1959,
    dateConfidence: "year_range",
    place: "Reno, Nevada",
    placeConfidence: "city_region",
  }]);
  assert.equal(anchor.date_confidence, "year_range");
  assert.equal(anchor.year_start, 1957);
  assert.equal(anchor.year_end, 1959);
  assert.equal(contextKey(anchor), "reno-nv|1957-1959");
});

test("missing city/region prevents responsible context retrieval", () => {
  const anchor = buildContextAnchor([{
    turnId: "turn-date",
    year: 1958,
    dateConfidence: "year",
    place: "Nevada",
    placeConfidence: "region_only",
  }]);
  assert.deepEqual(assessContextEligibility(anchor), { context_ready: false, context_missing: ["place"] });
  assert.equal(candidateFor(anchor).status, "not_ready");
});

test("missing date prevents responsible context retrieval", () => {
  const anchor = buildContextAnchor([{
    turnId: "turn-place",
    place: "Reno, Nevada",
    placeConfidence: "city_region",
  }]);
  assert.deepEqual(assessContextEligibility(anchor), { context_ready: false, context_missing: ["date"] });
  assert.equal(contextKey(anchor), null);
});

test("duplicate context key preserves the existing candidate lifecycle", () => {
  const anchor = buildContextAnchor([{
    turnId: "turn-context",
    year: 1958,
    dateConfidence: "year",
    place: "Reno, Nevada",
    placeConfidence: "city_region",
  }]);
  const original = candidateFor(anchor);
  const dismissed = transitionNewsreelCandidate(original, "dismissed", "2026-09-07T12:00:00.000Z");
  const duplicate = createNewsreelCandidate({
    anchor,
    previousCandidates: [dismissed],
    resumeQuestion: "A later question that must not replace the original snapshot",
    resumeThread: "a later thread",
    resumeDirectorState: { ...resumeDirectorState, current_topic: "a later topic" },
  });
  assert.deepEqual(duplicate, dismissed);
  assert.equal(duplicate.status, "dismissed");
  assert.equal(duplicate.dismissed_at, "2026-09-07T12:00:00.000Z");
});

test("candidate preserves exact resume question, thread, and Director state", () => {
  const anchor = buildContextAnchor([{
    turnId: "turn-context",
    year: 1958,
    dateConfidence: "year",
    place: "Reno, Nevada",
    placeConfidence: "city_region",
  }]);
  const candidate = candidateFor(anchor);
  assert.equal(candidate.resume_question, "How did you first get into boxing?");
  assert.equal(candidate.resume_thread, "how boxing began");
  assert.deepEqual(candidate.resume_director_state, resumeDirectorState);
});

test("context readiness never changes the active interview question", () => {
  const interviewDecision = {
    next_question: "How did you first get into boxing?",
    story_thread: "how boxing began",
    ...resumeDirectorState,
  };
  const before = structuredClone(interviewDecision);
  const candidate = deriveNewsreelCandidate({
    turns: [
      { id: "turn-birth", transcript: "I was born in 1946." },
      { id: "turn-boxing", transcript: "I started boxing when I was about 12 in Reno, Nevada." },
    ],
    resumeQuestion: interviewDecision.next_question,
    resumeThread: interviewDecision.story_thread,
    resumeDirectorState,
  });
  assert.equal(candidate.context_ready, true);
  assert.equal(candidate.context_key, "reno-nv|1958");
  assert.equal(candidate.status, "ready");
  assert.deepEqual(interviewDecision, before);
  assert.equal(candidate.resume_question, interviewDecision.next_question);
});

test("future retrieval and script contracts enforce sourcing, safety, and fixed order", () => {
  assert.deepEqual(NEWSREEL_SCRIPT_TARGET.section_order, ["local", "national", "international"]);
  assert.equal(NEWSREEL_SCRIPT_TARGET.minimum_words, 300);
  assert.equal(NEWSREEL_SCRIPT_TARGET.maximum_words, 450);
  assert.equal(NEWSREEL_SCRIPT_SCHEMA.additionalProperties, false);
  assert.deepEqual(Object.keys(NEWSREEL_SCRIPT_SCHEMA.properties), NEWSREEL_SCRIPT_SCHEMA.required);
  assert.match(NEWSREEL_GROUNDING_RULES, /never supplies facts about the storyteller's own life/i);
  assert.match(NEWSREEL_GROUNDING_RULES, /saw, heard, attended, knew, experienced, or cared about/i);
  assert.match(NEWSREEL_GROUNDING_RULES, /local, national, and international.*fixed order/i);
});

