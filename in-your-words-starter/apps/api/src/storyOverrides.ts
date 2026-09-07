import crypto from "node:crypto";
import type { NewsreelCandidate } from "./newsreel.js";
import type { InterviewDecision } from "./openaiInterview.js";

export const STORY_OVERRIDE_INTENTS = ["story_correction", "story_addendum"] as const;
export const CORRECTION_TYPES = [
  "fact_replacement",
  "fact_clarification",
  "timeline_correction",
  "place_correction",
  "relationship_correction",
  "other",
] as const;
export const CORRECTION_STATUSES = ["pending_clarification", "applied", "unresolved"] as const;
export const OVERRIDE_INTERACTION_STATUSES = ["awaiting_clarification", "completed", "unresolved"] as const;

export type StoryOverrideIntent = typeof STORY_OVERRIDE_INTENTS[number];
export type CorrectionType = typeof CORRECTION_TYPES[number];
export type CorrectionStatus = typeof CORRECTION_STATUSES[number];
export type OverrideInteractionStatus = typeof OVERRIDE_INTERACTION_STATUSES[number];

export type DirectorStateSnapshot = Pick<InterviewDecision,
  "chronology_status" | "approx_age_known" | "approx_year_known" | "place_known" |
  "current_life_period" | "current_topic" | "story_is_emerging" | "story_thread" |
  "director_note" | "question_objective" | "followup_value" | "followup_reason" |
  "story_resolution_status" | "story_importance" | "current_thread_followup_count" |
  "followup_budget" | "followup_budget_remaining" | "should_advance" | "context_opportunity">;

export type InterviewBookmark = {
  current_question: string;
  current_interview_thread: string;
  director_state: DirectorStateSnapshot | null;
  followup_budget_state: {
    current_thread_followup_count: number;
    followup_budget: number;
    followup_budget_remaining: number;
  };
  newsreel_candidate: NewsreelCandidate | null;
};

export type CorrectionRecord = {
  correction_id: string;
  correction_type: CorrectionType;
  source_turn_id: string;
  target_turn_id: string | null;
  target_fact_path: string | null;
  original_value: string | null;
  corrected_value: string | null;
  correction_transcript: string;
  status: CorrectionStatus;
  created_at: string;
};

export type AddendumRecord = {
  addendum_id: string;
  source_turn_id: string;
  target_turn_id: string | null;
  topic: string;
  transcript: string;
  created_at: string;
};

export type AcceptedStoryFact = {
  fact_path: string;
  value: string;
  source_turn_id: string;
  target_turn_id: string;
  supersedes_value: string;
  correction_id: string;
  accepted_at: string;
};

export type StoryTurnReference = {
  id: string;
  transcript: string;
  question_text?: string;
  ai_payload?: Record<string, unknown> | null;
};

export type StoryOverrideInteraction = {
  interaction_id: string;
  intent: StoryOverrideIntent;
  status: OverrideInteractionStatus;
  bookmark: InterviewBookmark;
  record_id: string;
  target_hint: string | null;
  clarification_prompt: string | null;
  started_at: string;
  completed_at: string | null;
};

export type StoryOverrideResult = {
  intent: StoryOverrideIntent;
  interaction: StoryOverrideInteraction;
  correction_record: CorrectionRecord | null;
  addendum_record: AddendumRecord | null;
  accepted_story_facts: AcceptedStoryFact[];
  next_question: string;
  speak_text: string;
  question_invalidated: boolean;
  context_changed: boolean;
};

type CorrectionAnalysis = Omit<CorrectionRecord, "correction_id" | "source_turn_id" | "correction_transcript" | "created_at">;

const correctionSignal = /\b(?:correct(?:ion| something)?|amend|(?:had|have|got) (?:the|that) .{0,24}wrong|was(?:n't| not)|i said .{0,80}\bbut\b|actually,? i need to correct)\b/i;
const addendumSignal = /\b(?:just remembered|something else about|another thing about|add(?: something)?|forgot to mention|one more thing)\b/i;
const numberWords: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

function cleanValue(value: string | undefined) {
  return value?.trim().replace(/^[,;:\s]+|[,;.!?\s]+$/g, "") || null;
}

function canonicalTranscript(value: string) {
  return value.replace(/[‘’]/g, "'").replace(/[“”]/g, "\"");
}

function parseNumber(value: string | undefined) {
  if (!value) return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : numberWords[value.toLowerCase()] ?? null;
}

function findTarget(turns: StoryTurnReference[], originalValue: string | null, hint?: RegExp) {
  const matching = turns.filter((turn) =>
    (!originalValue || turn.transcript.toLowerCase().includes(originalValue.toLowerCase())) &&
    (!hint || hint.test(turn.transcript)));
  return matching.length === 1 ? matching[0] : null;
}

function targetFromAcceptedFact(
  turns: StoryTurnReference[],
  acceptedFacts: AcceptedStoryFact[],
  factPath: string,
  value: string,
) {
  const accepted = [...acceptedFacts].reverse().find((fact) =>
    fact.fact_path === factPath && fact.value.toLowerCase() === value.toLowerCase());
  return accepted ? turns.find((turn) => turn.id === accepted.target_turn_id) ?? null : null;
}

export function detectStoryOverrideIntent(
  transcript: string,
  pendingInteraction?: StoryOverrideInteraction | null,
): StoryOverrideIntent | null {
  if (pendingInteraction?.status === "awaiting_clarification") return pendingInteraction.intent;
  const text = canonicalTranscript(transcript);
  if (correctionSignal.test(text)) return "story_correction";
  if (addendumSignal.test(text)) return "story_addendum";
  return null;
}

export function createInterviewBookmark(args: {
  currentQuestion: string;
  priorDecision?: InterviewDecision | null;
  newsreelCandidate?: NewsreelCandidate | null;
}): InterviewBookmark {
  const decision = args.priorDecision;
  const directorState: DirectorStateSnapshot | null = decision ? {
    chronology_status: decision.chronology_status,
    approx_age_known: decision.approx_age_known,
    approx_year_known: decision.approx_year_known,
    place_known: decision.place_known,
    current_life_period: decision.current_life_period,
    current_topic: decision.current_topic,
    story_is_emerging: decision.story_is_emerging,
    story_thread: decision.story_thread,
    director_note: decision.director_note,
    question_objective: decision.question_objective,
    followup_value: decision.followup_value,
    followup_reason: decision.followup_reason,
    story_resolution_status: decision.story_resolution_status,
    story_importance: decision.story_importance,
    current_thread_followup_count: decision.current_thread_followup_count,
    followup_budget: decision.followup_budget,
    followup_budget_remaining: decision.followup_budget_remaining,
    should_advance: decision.should_advance,
    context_opportunity: decision.context_opportunity,
  } : null;
  return {
    current_question: args.currentQuestion,
    current_interview_thread: decision?.story_thread ?? args.newsreelCandidate?.resume_thread ?? "the current interview question",
    director_state: directorState,
    followup_budget_state: {
      current_thread_followup_count: decision?.current_thread_followup_count ?? 0,
      followup_budget: decision?.followup_budget ?? 0,
      followup_budget_remaining: decision?.followup_budget_remaining ?? 0,
    },
    newsreel_candidate: args.newsreelCandidate ?? null,
  };
}

function pendingCorrection(): CorrectionAnalysis {
  return {
    correction_type: "other",
    target_turn_id: null,
    target_fact_path: null,
    original_value: null,
    corrected_value: null,
    status: "pending_clarification",
  };
}

export function analyzeStoryCorrection(
  transcript: string,
  storyTurns: StoryTurnReference[],
  acceptedFacts: AcceptedStoryFact[] = [],
): CorrectionAnalysis {
  const text = canonicalTranscript(transcript).trim();

  const ages = [...text.matchAll(/\b(?:age\s+|was\s+|at\s+)?(\d{1,3}|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/gi)]
    .map((match) => ({ raw: match[1], number: parseNumber(match[1]) }))
    .filter((entry) => entry.number != null && entry.number >= 0 && entry.number <= 130);
  const ageHint = /\b(?:age|old|started|began|when i was)\b/i;
  if (ageHint.test(text) && ages.length >= 2) {
    const firstAge = ages[0]!;
    const lastAge = ages.at(-1)!;
    const original = String(firstAge.number);
    const corrected = String(lastAge.number);
    const target = findTarget(storyTurns, firstAge.raw ?? null, /\b(?:age|old|started|began|when i was)\b/i) ??
      targetFromAcceptedFact(storyTurns, acceptedFacts, "chronology.age", original);
    return {
      correction_type: "timeline_correction",
      target_turn_id: target?.id ?? null,
      target_fact_path: "chronology.age",
      original_value: original,
      corrected_value: corrected,
      status: target ? "applied" : "pending_clarification",
    };
  }
  if (ageHint.test(text) && ages.length === 1 && /\bactually\b/i.test(text)) {
    const ageTargets = storyTurns.filter((turn) => /\b(?:age|old|started|began|when i was)\b/i.test(turn.transcript));
    const target = ageTargets.length === 1 ? ageTargets[0]! : null;
    const originalMatch = target?.transcript.match(/\b(\d{1,3}|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/i);
    const original = parseNumber(originalMatch?.[1]);
    return {
      correction_type: "timeline_correction",
      target_turn_id: target?.id ?? null,
      target_fact_path: "chronology.age",
      original_value: original == null ? null : String(original),
      corrected_value: String(ages[0]!.number),
      status: target && original != null ? "applied" : "pending_clarification",
    };
  }

  const years = [...text.matchAll(/\b((?:18|19|20)\d{2})\b/g)].map((match) => match[1]);
  if (/\byear|born\b/i.test(text) && years.length >= 2) {
    const originalYear = years[0]!;
    const correctedYear = years.at(-1)!;
    const factPath = /\bborn\b/i.test(text) ? "chronology.birth_year" : "chronology.year";
    const target = findTarget(storyTurns, originalYear) ??
      targetFromAcceptedFact(storyTurns, acceptedFacts, factPath, originalYear);
    return {
      correction_type: "timeline_correction",
      target_turn_id: target?.id ?? null,
      target_fact_path: factPath,
      original_value: originalYear,
      corrected_value: correctedYear,
      status: target ? "applied" : "pending_clarification",
    };
  }

  const relationship = text.match(/\b(?:wasn't|was not)\s+my\s+([a-z][a-z'-]*)[,;]?\s+(?:she|he|they)\s+(?:was|were)\s+(?:actually\s+)?my\s+([a-z][a-z'-]*)\b/i);
  if (relationship) {
    const originalRelationship = relationship[1]!;
    const correctedRelationship = relationship[2]!;
    const target = findTarget(storyTurns, originalRelationship, /\b(?:aunt|uncle|mother|father|mom|dad|brother|sister|cousin|friend|spouse|wife|husband|partner)\b/i) ??
      targetFromAcceptedFact(storyTurns, acceptedFacts, "relationship.type", originalRelationship);
    return {
      correction_type: "relationship_correction",
      target_turn_id: target?.id ?? null,
      target_fact_path: "relationship.type",
      original_value: originalRelationship.toLowerCase(),
      corrected_value: correctedRelationship.toLowerCase(),
      status: target ? "applied" : "pending_clarification",
    };
  }

  const name = text.match(/\b(?:name was|called)\s+([a-z][a-z'-]*)\b.*?\b(?:but|actually)\b.*?\b(?:was|name was|called)\s+([a-z][a-z'-]*)\b/i);
  if (name) {
    const originalName = name[1]!;
    const correctedName = name[2]!;
    const target = findTarget(storyTurns, originalName) ??
      targetFromAcceptedFact(storyTurns, acceptedFacts, "person.name", originalName);
    return {
      correction_type: "relationship_correction",
      target_turn_id: target?.id ?? null,
      target_fact_path: "person.name",
      original_value: originalName,
      corrected_value: correctedName,
      status: target ? "applied" : "pending_clarification",
    };
  }

  const place = text.match(/\b(?:said (?:we |i )?(?:lived|were|was) in\s+|wasn't\s+|was not\s+)([a-z][a-z .'-]*?)(?:\s+then)?[,;]\s*(?:but\s+)?(?:it\s+was\s+)?(?:actually\s+)?([a-z][a-z .'-]*?)[.!?]?$/i);
  if (place) {
    const original = cleanValue(place[1]);
    const corrected = cleanValue(place[2]);
    const target = findTarget(storyTurns, original, /\b(?:in|near|around|living|lived|moved|grew up)\b/i) ??
      (original ? targetFromAcceptedFact(storyTurns, acceptedFacts, "place.city", original) : null);
    return {
      correction_type: "place_correction",
      target_turn_id: target?.id ?? null,
      target_fact_path: "place.city",
      original_value: original,
      corrected_value: corrected,
      status: target && corrected ? "applied" : "pending_clarification",
    };
  }

  const replacement = text.match(/\bi said\s+(.+?)[,;]\s*but\s+(?:actually\s+)?(.+?)[.!?]?$/i);
  if (replacement) {
    const original = cleanValue(replacement[1]);
    const corrected = cleanValue(replacement[2]);
    const target = findTarget(storyTurns, original) ??
      (original ? targetFromAcceptedFact(storyTurns, acceptedFacts, "story.fact", original) : null);
    return {
      correction_type: "fact_replacement",
      target_turn_id: target?.id ?? null,
      target_fact_path: "story.fact",
      original_value: original,
      corrected_value: corrected,
      status: target && corrected ? "applied" : "pending_clarification",
    };
  }

  return pendingCorrection();
}

function mergeAcceptedFacts(previous: AcceptedStoryFact[], record: CorrectionRecord): AcceptedStoryFact[] {
  if (record.status !== "applied" || !record.target_turn_id || !record.target_fact_path ||
      record.original_value == null || record.corrected_value == null) return previous;
  const accepted: AcceptedStoryFact = {
    fact_path: record.target_fact_path,
    value: record.corrected_value,
    source_turn_id: record.source_turn_id,
    target_turn_id: record.target_turn_id,
    supersedes_value: record.original_value,
    correction_id: record.correction_id,
    accepted_at: record.created_at,
  };
  return [
    ...previous.filter((fact) => !(fact.fact_path === accepted.fact_path && fact.target_turn_id === accepted.target_turn_id)),
    accepted,
  ];
}

function correctionAcknowledgement(record: CorrectionRecord) {
  if (record.target_fact_path === "chronology.age") return `Got it. I'll treat ${record.corrected_value} as the corrected age.`;
  if (record.target_fact_path === "chronology.year" || record.target_fact_path === "chronology.birth_year") {
    return `Got it. I'll treat ${record.corrected_value} as the corrected year.`;
  }
  if (record.target_fact_path === "place.city" || record.target_fact_path === "place") {
    return `Got it. I'll treat ${record.corrected_value} as the corrected place.`;
  }
  if (record.target_fact_path === "relationship.type") return `Got it. I'll treat ${record.corrected_value} as the corrected relationship.`;
  if (record.target_fact_path === "person.name") return `Got it. I'll use ${record.corrected_value} as the corrected name.`;
  return "Got it. I'll use that correction going forward.";
}

function correctionInvalidatesQuestion(record: CorrectionRecord, question: string) {
  return record.status === "applied" && Boolean(record.original_value) &&
    question.toLowerCase().includes(record.original_value!.toLowerCase());
}

function addendumContent(transcript: string) {
  const colon = transcript.indexOf(":");
  if (colon >= 0 && transcript.slice(colon + 1).trim().length > 5) return transcript.slice(colon + 1).trim();
  const stripped = transcript.replace(/^.*?\b(?:just remembered|forgot to mention|one more thing)\b(?:\s+something else)?(?:\s+about\s+[^,.]+)?[,.:;-]*/i, "").trim();
  return stripped.length > 12 ? stripped : null;
}

function addendumTopic(transcript: string, bookmark: InterviewBookmark) {
  const match = transcript.match(/\babout\s+(?:my\s+|the\s+)?([^,.!?]+)/i);
  return cleanValue(match?.[1]) ?? bookmark.director_state?.current_topic ?? bookmark.current_interview_thread;
}

function findAddendumTarget(turns: StoryTurnReference[], topic: string) {
  const keywords = topic.toLowerCase().split(/\W+/).filter((word) => word.length > 3 && !["something", "another", "thing", "about"].includes(word));
  return [...turns].reverse().find((turn) => {
    const searchable = [
      turn.transcript,
      String(turn.ai_payload?.current_topic ?? ""),
      String(turn.ai_payload?.story_thread ?? ""),
    ].join(" ").toLowerCase();
    return keywords.some((word) => searchable.includes(word));
  }) ?? (turns.length === 1 ? turns[0]! : null);
}

export function handleStoryOverride(args: {
  transcript: string;
  sourceTurnId: string;
  storyTurns: StoryTurnReference[];
  currentQuestion: string;
  bookmark: InterviewBookmark;
  pendingInteraction?: StoryOverrideInteraction | null;
  acceptedStoryFacts?: AcceptedStoryFact[];
  now?: string;
}): StoryOverrideResult | null {
  const intent = detectStoryOverrideIntent(args.transcript, args.pendingInteraction);
  if (!intent) return null;
  const now = args.now ?? new Date().toISOString();
  const continued = args.pendingInteraction?.status === "awaiting_clarification";
  const interactionId = args.pendingInteraction?.interaction_id ?? crypto.randomUUID();
  const recordId = args.pendingInteraction?.record_id ?? crypto.randomUUID();
  const bookmark = args.pendingInteraction?.bookmark ?? args.bookmark;
  const acceptedFacts = args.acceptedStoryFacts ?? [];

  if (intent === "story_correction") {
    const analysis = analyzeStoryCorrection(args.transcript, args.storyTurns, acceptedFacts);
    const record: CorrectionRecord = {
      correction_id: recordId,
      source_turn_id: args.sourceTurnId,
      correction_transcript: args.transcript,
      created_at: now,
      ...analysis,
    };
    if (record.status !== "applied") {
      const prompt = analysis.original_value || analysis.corrected_value
        ? "Which earlier statement should I apply that correction to?"
        : "What would you like to correct?";
      return {
        intent,
        interaction: {
          interaction_id: interactionId,
          intent,
          status: "awaiting_clarification",
          bookmark,
          record_id: recordId,
          target_hint: args.pendingInteraction?.target_hint ?? record.original_value,
          clarification_prompt: prompt,
          started_at: args.pendingInteraction?.started_at ?? now,
          completed_at: null,
        },
        correction_record: record,
        addendum_record: null,
        accepted_story_facts: acceptedFacts,
        next_question: prompt,
        speak_text: prompt,
        question_invalidated: false,
        context_changed: false,
      };
    }

    const acknowledgement = correctionAcknowledgement(record);
    return {
      intent,
      interaction: {
        interaction_id: interactionId,
        intent,
        status: "completed",
        bookmark,
        record_id: recordId,
        target_hint: args.pendingInteraction?.target_hint ?? record.original_value,
        clarification_prompt: null,
        started_at: args.pendingInteraction?.started_at ?? now,
        completed_at: now,
      },
      correction_record: record,
      addendum_record: null,
      accepted_story_facts: mergeAcceptedFacts(acceptedFacts, record),
      next_question: bookmark.current_question,
      speak_text: continued ? `${acknowledgement} ${bookmark.current_question}` : acknowledgement,
      question_invalidated: correctionInvalidatesQuestion(record, bookmark.current_question),
      context_changed: ["chronology.age", "chronology.year", "chronology.birth_year", "place", "place.city"].includes(record.target_fact_path ?? ""),
    };
  }

  const content = continued ? args.transcript.trim() : addendumContent(args.transcript);
  if (!content) {
    const prompt = "Go ahead.";
    return {
      intent,
      interaction: {
        interaction_id: interactionId,
        intent,
        status: "awaiting_clarification",
          bookmark,
          record_id: recordId,
          target_hint: addendumTopic(args.transcript, bookmark),
          clarification_prompt: prompt,
        started_at: args.pendingInteraction?.started_at ?? now,
        completed_at: null,
      },
      correction_record: null,
      addendum_record: null,
      accepted_story_facts: acceptedFacts,
      next_question: prompt,
      speak_text: prompt,
      question_invalidated: false,
      context_changed: false,
    };
  }

  const topic = args.pendingInteraction?.target_hint ?? addendumTopic(args.transcript, bookmark);
  const target = findAddendumTarget(args.storyTurns, topic);
  const record: AddendumRecord = {
    addendum_id: recordId,
    source_turn_id: args.sourceTurnId,
    target_turn_id: target?.id ?? null,
    topic,
    transcript: content,
    created_at: now,
  };
  const acknowledgement = "Got it. I've added that to the earlier story.";
  return {
    intent,
    interaction: {
      interaction_id: interactionId,
      intent,
      status: "completed",
      bookmark,
      record_id: recordId,
      target_hint: topic,
      clarification_prompt: null,
      started_at: args.pendingInteraction?.started_at ?? now,
      completed_at: now,
    },
    correction_record: null,
    addendum_record: record,
    accepted_story_facts: acceptedFacts,
    next_question: bookmark.current_question,
    speak_text: continued ? `${acknowledgement} ${bookmark.current_question}` : acknowledgement,
    question_invalidated: false,
    context_changed: false,
  };
}

export function isStoryOverrideInteraction(value: unknown): value is StoryOverrideInteraction {
  if (!value || typeof value !== "object") return false;
  const interaction = value as Partial<StoryOverrideInteraction>;
  return STORY_OVERRIDE_INTENTS.includes(interaction.intent as StoryOverrideIntent) &&
    OVERRIDE_INTERACTION_STATUSES.includes(interaction.status as OverrideInteractionStatus) &&
    typeof interaction.interaction_id === "string" && Boolean(interaction.bookmark);
}

