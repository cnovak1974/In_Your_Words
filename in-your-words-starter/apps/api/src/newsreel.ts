export const DATE_CONFIDENCE_VALUES = ["exact", "year", "approx_year", "year_range", "insufficient"] as const;
export const PLACE_CONFIDENCE_VALUES = ["exact", "city_region", "region_only", "insufficient"] as const;
export const NEWSREEL_STATUS_VALUES = ["not_ready", "ready", "prepared", "offered", "played", "dismissed", "invalidated"] as const;
export const HISTORICAL_ITEM_CONFIDENCE_VALUES = ["high", "medium", "low"] as const;

export type DateConfidence = typeof DATE_CONFIDENCE_VALUES[number];
export type PlaceConfidence = typeof PLACE_CONFIDENCE_VALUES[number];
export type NewsreelStatus = typeof NEWSREEL_STATUS_VALUES[number];
export type HistoricalItemConfidence = typeof HISTORICAL_ITEM_CONFIDENCE_VALUES[number];
export type ContextMissing = "date" | "place";

export type ContextAnchor = {
  place: string | null;
  place_confidence: PlaceConfidence;
  age: number | null;
  birth_year: number | null;
  approx_year: number | null;
  year_start: number | null;
  year_end: number | null;
  date_confidence: DateConfidence;
  source_turn_ids: string[];
};

export type ContextEligibility = {
  context_ready: boolean;
  context_missing: ContextMissing[];
};

export type ContextEvidence = {
  turnId: string;
  place?: string;
  placeConfidence?: Exclude<PlaceConfidence, "insufficient">;
  age?: number;
  ageIsApproximate?: boolean;
  birthYear?: number;
  year?: number;
  approxYear?: number;
  yearStart?: number;
  yearEnd?: number;
  dateConfidence?: Exclude<DateConfidence, "insufficient">;
};

export type ContextFactOverride = {
  sourceTurnId: string;
  targetTurnId: string;
  factPath: string;
  value: string;
};

export type NewsreelResumeDirectorState = {
  chronology_status: string;
  current_life_period: string;
  current_topic: string;
  story_thread: string;
  story_is_emerging: boolean;
  story_resolution_status: string;
  story_importance: string;
  should_advance: boolean;
};

export type NewsreelCandidate = ContextEligibility & {
  context_key: string | null;
  anchor: ContextAnchor;
  status: NewsreelStatus;
  prepared_at: string | null;
  offered_at: string | null;
  played_at: string | null;
  dismissed_at: string | null;
  invalidated_at: string | null;
  resume_question: string;
  resume_thread: string;
  resume_director_state: NewsreelResumeDirectorState;
};

export type HistoricalContextItem = {
  title: string;
  date: string | null;
  date_range: { start: string; end: string } | null;
  place: string | null;
  summary: string;
  source_name: string;
  source_url: string;
  source_type: string;
  confidence: HistoricalItemConfidence;
  relevance: number;
};

export type HistoricalContextCollections = {
  local: HistoricalContextItem[];
  national: HistoricalContextItem[];
  international: HistoricalContextItem[];
};

export interface HistoricalContextProvider {
  retrieve(anchor: ContextAnchor): Promise<HistoricalContextCollections>;
}

export type NewsreelCitation = {
  title: string;
  source_name: string;
  source_url: string;
};

export type NewsreelScriptResult = {
  local_script: string;
  national_script: string;
  international_script: string;
  full_script: string;
  word_count: number;
  citations: NewsreelCitation[];
};

export interface NewsreelScriptGenerator {
  generate(anchor: ContextAnchor, context: HistoricalContextCollections): Promise<NewsreelScriptResult>;
}

export const NEWSREEL_SCRIPT_TARGET = {
  minimum_words: 300,
  maximum_words: 450,
  section_order: ["local", "national", "international"] as const,
};

export const NEWSREEL_GROUNDING_RULES = `
Newsreel describes sourced facts about the surrounding world. It never supplies facts about the storyteller's own life.
Historical context must never be phrased as something the storyteller saw, heard, attended, knew, experienced, or cared about unless that claim came from the storyteller's own transcript.
BAD: "You probably remember the highway construction downtown."
GOOD: "Around Reno that year, construction was underway on..."
The storyteller may skip Newsreel, and Newsreel must never interrupt an active story or replace the interview resume question.
The script may use only facts in the provider's sourced local, national, and international collections, in that fixed order.
`;

export const NEWSREEL_SCRIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    local_script: { type: "string" },
    national_script: { type: "string" },
    international_script: { type: "string" },
    full_script: { type: "string" },
    word_count: { type: "integer", minimum: 0 },
    citations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          source_name: { type: "string" },
          source_url: { type: "string" },
        },
        required: ["title", "source_name", "source_url"],
      },
    },
  },
  required: ["local_script", "national_script", "international_script", "full_script", "word_count", "citations"],
};

type ContextTurn = { id: string; transcript: string };

const numberWords: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

const regionAbbreviations: Record<string, string> = {
  alabama: "al", alaska: "ak", arizona: "az", arkansas: "ar", california: "ca", colorado: "co",
  connecticut: "ct", delaware: "de", florida: "fl", georgia: "ga", hawaii: "hi", idaho: "id",
  illinois: "il", indiana: "in", iowa: "ia", kansas: "ks", kentucky: "ky", louisiana: "la",
  maine: "me", maryland: "md", massachusetts: "ma", michigan: "mi", minnesota: "mn",
  mississippi: "ms", missouri: "mo", montana: "mt", nebraska: "ne", nevada: "nv",
  "new hampshire": "nh", "new jersey": "nj", "new mexico": "nm", "new york": "ny",
  "north carolina": "nc", "north dakota": "nd", ohio: "oh", oklahoma: "ok", oregon: "or",
  pennsylvania: "pa", "rhode island": "ri", "south carolina": "sc", "south dakota": "sd",
  tennessee: "tn", texas: "tx", utah: "ut", vermont: "vt", virginia: "va", washington: "wa",
  "west virginia": "wv", wisconsin: "wi", wyoming: "wy", "district of columbia": "dc",
};

function validYear(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1000 && Number(value) <= 3000;
}

function validAge(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 130;
}

function parseAge(value: string) {
  const numeric = Number(value);
  if (Number.isInteger(numeric)) return numeric;
  return numberWords[value.toLowerCase()];
}

function normalizePlace(place: string) {
  return place.trim().replace(/[.!?]+$/, "").replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ");
}

function slug(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function placeKey(place: string) {
  const [locality, region] = place.split(",").map((part) => part.trim());
  if (locality && region) {
    const normalizedRegion = regionAbbreviations[region.toLowerCase()] ?? slug(region);
    return `${slug(locality)}-${normalizedRegion}`;
  }
  return slug(place);
}

function correctedPlace(originalPlace: string | undefined, correctedValue: string) {
  const normalizedCorrection = normalizePlace(correctedValue);
  if (normalizedCorrection.includes(",") || !originalPlace?.includes(",")) return normalizedCorrection;
  const region = originalPlace.split(",").slice(1).join(",").trim();
  return normalizePlace(`${normalizedCorrection}, ${region}`);
}

export function extractContextEvidence(turn: ContextTurn): ContextEvidence[] {
  const evidence: ContextEvidence[] = [];
  const text = turn.transcript.trim();
  if (!text) return evidence;

  const birthMatch = text.match(/\b(?:i was born|born)\s+(?:in\s+)?((?:18|19|20)\d{2})\b/i);
  if (birthMatch) evidence.push({ turnId: turn.id, birthYear: Number(birthMatch[1]) });

  const ageMatch = text.match(/\b(?:when i was|i was|at age)\s+(about\s+|around\s+)?(\d{1,3}|[a-z]+)\b/i);
  if (ageMatch?.[2]) {
    const age = parseAge(ageMatch[2]);
    if (validAge(age)) evidence.push({ turnId: turn.id, age, ageIsApproximate: Boolean(ageMatch[1]) });
  }

  const rangeMatch = text.match(/\b(?:from|between)\s+((?:18|19|20)\d{2})\s+(?:to|and|through|until)\s+((?:18|19|20)\d{2})\b/i);
  if (rangeMatch) {
    evidence.push({
      turnId: turn.id,
      yearStart: Number(rangeMatch[1]),
      yearEnd: Number(rangeMatch[2]),
      dateConfidence: "year_range",
    });
  } else {
    const yearMatch = text.match(/\b(around|about|approximately|in|during)\s+((?:18|19|20)\d{2})\b/i);
    if (yearMatch?.[1] && yearMatch[2] && Number(yearMatch[2]) !== Number(birthMatch?.[1])) {
      const approximate = /^(?:around|about|approximately)$/i.test(yearMatch[1]);
      evidence.push({
        turnId: turn.id,
        ...(approximate ? { approxYear: Number(yearMatch[2]) } : { year: Number(yearMatch[2]) }),
        dateConfidence: approximate ? "approx_year" : "year",
      });
    }
  }

  const cityRegionMatch = text.match(/(?:^|\b(?:in|near|around|living in|grew up in|moved to)\s+)([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,2}),\s*([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*)?)(?=\s+(?:when|while|and|but)\b|[.!?]|$)/i);
  if (cityRegionMatch) {
    evidence.push({
      turnId: turn.id,
      place: normalizePlace(`${cityRegionMatch[1]}, ${cityRegionMatch[2]}`),
      placeConfidence: "city_region",
    });
  } else {
    const regionNames = Object.keys(regionAbbreviations).sort((a, b) => b.length - a.length).join("|");
    const regionMatch = text.match(new RegExp(`\\b(?:in|near|around|living in|grew up in|moved to)\\s+(${regionNames})\\b`, "i"));
    if (regionMatch?.[1]) {
      evidence.push({ turnId: turn.id, place: normalizePlace(regionMatch[1]), placeConfidence: "region_only" });
    }
  }

  return evidence;
}

export function buildContextAnchor(evidence: ContextEvidence[]): ContextAnchor {
  const sourceIds = new Set<string>();
  const placeRank: Record<PlaceConfidence, number> = { insufficient: 0, region_only: 1, city_region: 2, exact: 3 };
  let place: string | null = null;
  let placeConfidence: PlaceConfidence = "insufficient";
  let placeTurnId: string | null = null;

  for (const item of evidence) {
    if (!item.place || !item.placeConfidence) continue;
    if (placeRank[item.placeConfidence] >= placeRank[placeConfidence]) {
      place = normalizePlace(item.place);
      placeConfidence = item.placeConfidence;
      placeTurnId = item.turnId;
    }
  }

  const ageEvidence = [...evidence].reverse().find((item) => validAge(item.age));
  const birthEvidence = [...evidence].reverse().find((item) => validYear(item.birthYear));
  const explicitDateEvidence = [...evidence].reverse().find((item) =>
    (validYear(item.year) && (item.dateConfidence === "exact" || item.dateConfidence === "year")) ||
    (validYear(item.approxYear) && item.dateConfidence === "approx_year") ||
    (validYear(item.yearStart) && validYear(item.yearEnd) && item.dateConfidence === "year_range"));

  const age = ageEvidence?.age ?? null;
  const birthYear = birthEvidence?.birthYear ?? null;
  let approxYear: number | null = null;
  let yearStart: number | null = null;
  let yearEnd: number | null = null;
  let dateConfidence: DateConfidence = "insufficient";

  if (explicitDateEvidence?.dateConfidence === "year_range" &&
      validYear(explicitDateEvidence.yearStart) && validYear(explicitDateEvidence.yearEnd)) {
    yearStart = Math.min(explicitDateEvidence.yearStart, explicitDateEvidence.yearEnd);
    yearEnd = Math.max(explicitDateEvidence.yearStart, explicitDateEvidence.yearEnd);
    dateConfidence = "year_range";
    sourceIds.add(explicitDateEvidence.turnId);
  } else if (explicitDateEvidence && validYear(explicitDateEvidence.year)) {
    approxYear = explicitDateEvidence.year;
    dateConfidence = explicitDateEvidence.dateConfidence === "exact" ? "exact" : "year";
    sourceIds.add(explicitDateEvidence.turnId);
  } else if (explicitDateEvidence && validYear(explicitDateEvidence.approxYear)) {
    approxYear = explicitDateEvidence.approxYear;
    dateConfidence = "approx_year";
    sourceIds.add(explicitDateEvidence.turnId);
  } else if (validYear(birthYear) && validAge(age)) {
    approxYear = birthYear + age;
    if (validYear(approxYear)) {
      dateConfidence = "approx_year";
      if (ageEvidence?.ageIsApproximate) {
        yearStart = approxYear - 1;
        yearEnd = approxYear + 1;
      }
      sourceIds.add(birthEvidence!.turnId);
      sourceIds.add(ageEvidence!.turnId);
    } else {
      approxYear = null;
    }
  }

  if (placeTurnId) sourceIds.add(placeTurnId);
  if (ageEvidence) sourceIds.add(ageEvidence.turnId);
  if (birthEvidence) sourceIds.add(birthEvidence.turnId);

  return {
    place,
    place_confidence: placeConfidence,
    age,
    birth_year: birthYear,
    approx_year: approxYear,
    year_start: yearStart,
    year_end: yearEnd,
    date_confidence: dateConfidence,
    source_turn_ids: [...sourceIds].sort(),
  };
}

export function applyContextFactOverrides(
  evidence: ContextEvidence[],
  overrides: ContextFactOverride[] = [],
): ContextEvidence[] {
  const result = evidence.map((item) => ({ ...item }));
  for (const override of overrides) {
    const matching = result.filter((item) => item.turnId === override.targetTurnId);
    if (override.factPath === "chronology.age") {
      for (const item of matching) {
        delete item.age;
        delete item.ageIsApproximate;
      }
      const age = Number(override.value);
      if (validAge(age)) result.push({ turnId: override.sourceTurnId, age });
    } else if (override.factPath === "chronology.birth_year") {
      for (const item of matching) delete item.birthYear;
      const birthYear = Number(override.value);
      if (validYear(birthYear)) result.push({ turnId: override.sourceTurnId, birthYear });
    } else if (override.factPath === "chronology.year") {
      for (const item of matching) {
        delete item.year;
        delete item.approxYear;
        delete item.yearStart;
        delete item.yearEnd;
        delete item.dateConfidence;
      }
      const year = Number(override.value);
      if (validYear(year)) result.push({ turnId: override.sourceTurnId, year, dateConfidence: "year" });
    } else if (override.factPath === "place" || override.factPath === "place.city") {
      const originalPlace = [...matching].reverse().find((item) => item.place)?.place;
      for (const item of matching) {
        delete item.place;
        delete item.placeConfidence;
      }
      const place = correctedPlace(originalPlace, override.value);
      if (place) {
        result.push({
          turnId: override.sourceTurnId,
          place,
          placeConfidence: place.includes(",") ? "city_region" : "region_only",
        });
      }
    }
  }
  return result;
}

export function assessContextEligibility(anchor: ContextAnchor): ContextEligibility {
  const contextMissing: ContextMissing[] = [];
  if (anchor.date_confidence === "insufficient") contextMissing.push("date");
  if (anchor.place_confidence !== "exact" && anchor.place_confidence !== "city_region") contextMissing.push("place");
  return { context_ready: contextMissing.length === 0, context_missing: contextMissing };
}

export function contextKey(anchor: ContextAnchor): string | null {
  if (!assessContextEligibility(anchor).context_ready || !anchor.place) return null;
  const datePart = anchor.date_confidence === "year_range" && anchor.year_start != null && anchor.year_end != null
    ? `${anchor.year_start}-${anchor.year_end}`
    : anchor.approx_year == null ? null : String(anchor.approx_year);
  return datePart ? `${placeKey(anchor.place)}|${datePart}` : null;
}

export function isNewsreelCandidate(value: unknown): value is NewsreelCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NewsreelCandidate>;
  return NEWSREEL_STATUS_VALUES.includes(candidate.status as NewsreelStatus) &&
    typeof candidate.resume_question === "string" && typeof candidate.resume_thread === "string" &&
    Boolean(candidate.anchor && typeof candidate.anchor === "object");
}

export function createNewsreelCandidate(args: {
  anchor: ContextAnchor;
  previousCandidates?: NewsreelCandidate[];
  resumeQuestion: string;
  resumeThread: string;
  resumeDirectorState: NewsreelResumeDirectorState;
}): NewsreelCandidate {
  const eligibility = assessContextEligibility(args.anchor);
  const key = contextKey(args.anchor);
  if (key) {
    for (let index = (args.previousCandidates?.length ?? 0) - 1; index >= 0; index -= 1) {
      const candidate = args.previousCandidates?.[index];
      if (candidate?.context_key === key && candidate.status !== "not_ready" && candidate.status !== "invalidated") return candidate;
    }
  }
  return {
    ...eligibility,
    context_key: key,
    anchor: args.anchor,
    status: eligibility.context_ready ? "ready" : "not_ready",
    prepared_at: null,
    offered_at: null,
    played_at: null,
    dismissed_at: null,
    invalidated_at: null,
    resume_question: args.resumeQuestion,
    resume_thread: args.resumeThread,
    resume_director_state: args.resumeDirectorState,
  };
}

export function deriveNewsreelCandidate(args: {
  turns: ContextTurn[];
  previousCandidates?: NewsreelCandidate[];
  resumeQuestion: string;
  resumeThread: string;
  resumeDirectorState: NewsreelResumeDirectorState;
  factOverrides?: ContextFactOverride[];
}) {
  const evidence = applyContextFactOverrides(args.turns.flatMap(extractContextEvidence), args.factOverrides);
  const anchor = buildContextAnchor(evidence);
  return createNewsreelCandidate({ ...args, anchor });
}

export function invalidateNewsreelCandidates(args: {
  candidates: NewsreelCandidate[];
  targetTurnId: string;
  currentContextKey: string | null;
  at?: string;
}) {
  const at = args.at ?? new Date().toISOString();
  const invalidated = new Map<string, NewsreelCandidate>();
  for (const candidate of args.candidates) {
    if (candidate.status === "invalidated" || candidate.context_key === args.currentContextKey ||
        !candidate.anchor.source_turn_ids.includes(args.targetTurnId)) continue;
    invalidated.set(candidate.context_key ?? JSON.stringify(candidate.anchor), {
      ...candidate,
      status: "invalidated",
      invalidated_at: at,
    });
  }
  return [...invalidated.values()];
}

export function transitionNewsreelCandidate(
  candidate: NewsreelCandidate,
  status: Exclude<NewsreelStatus, "not_ready" | "ready" | "invalidated">,
  at = new Date().toISOString(),
): NewsreelCandidate {
  if (!candidate.context_ready) throw new Error("Newsreel context is not ready");
  return {
    ...candidate,
    status,
    prepared_at: status === "prepared" && !candidate.prepared_at ? at : candidate.prepared_at,
    offered_at: status === "offered" && !candidate.offered_at ? at : candidate.offered_at,
    played_at: status === "played" && !candidate.played_at ? at : candidate.played_at,
    dismissed_at: status === "dismissed" && !candidate.dismissed_at ? at : candidate.dismissed_at,
  };
}

