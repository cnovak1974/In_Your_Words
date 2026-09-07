import OpenAI from "openai";
import { config, providers } from "./config.js";
import { INTERVIEW_DIRECTOR_INSTRUCTIONS, QUESTION_WRITER_INSTRUCTIONS } from "./interviewPrompt.js";

const openai = new OpenAI({ apiKey: config.openaiApiKey });

export const CHRONOLOGY_STATUSES = [
  "needs_age_anchor",
  "needs_year_anchor",
  "needs_place_anchor",
  "unanchored",
  "partially_anchored",
  "anchored",
  "transitioning",
] as const;
export const CONTEXT_OPPORTUNITIES = ["none", "need_age", "need_year", "need_place", "date_place_ready"] as const;
export const FOLLOWUP_VALUES = ["high", "medium", "low"] as const;
export const STORY_RESOLUTION_STATUSES = ["open", "developing", "resolved"] as const;
export const STORY_IMPORTANCE_VALUES = ["minor", "meaningful", "major"] as const;
export const LIFE_PERIOD_VALUES = ["childhood", "adolescence", "other"] as const;
export const DOMAIN_STATUS_VALUES = ["not_started", "opening", "developing", "sufficient"] as const;
export const CHILDHOOD_DOMAINS = [
  "home_family", "elementary_school", "neighborhood_friends", "interests_hobbies", "sports",
  "community", "moves_major_changes",
] as const;
export const ADOLESCENCE_DOMAINS = [
  "middle_school", "high_school", "friends_social_life", "sports_activities", "interests_hobbies",
  "work", "dating_relationships", "family_responsibilities", "future_plans",
] as const;
export const LIFE_DOMAIN_VALUES = [
  "home_family", "elementary_school", "neighborhood_friends", "interests_hobbies", "sports",
  "community", "moves_major_changes", "middle_school", "high_school", "friends_social_life",
  "sports_activities", "work", "dating_relationships", "family_responsibilities", "future_plans", "other",
] as const;

export type ChronologyStatus = typeof CHRONOLOGY_STATUSES[number];
export type ContextOpportunity = typeof CONTEXT_OPPORTUNITIES[number];
export type FollowupValue = typeof FOLLOWUP_VALUES[number];
export type StoryResolutionStatus = typeof STORY_RESOLUTION_STATUSES[number];
export type StoryImportance = typeof STORY_IMPORTANCE_VALUES[number];
export type LifePeriod = typeof LIFE_PERIOD_VALUES[number];
export type DomainStatus = typeof DOMAIN_STATUS_VALUES[number];
export type LifeDomain = typeof LIFE_DOMAIN_VALUES[number];
export type StoryHistoryTurn = {
  question: string;
  answer: string;
  chronologyStatus?: ChronologyStatus;
  currentLifePeriod?: string;
  currentTopic?: string;
  storyThread?: string;
  storyIsEmerging?: boolean;
  followupValue?: FollowupValue;
  followupReason?: string;
  storyResolutionStatus?: StoryResolutionStatus;
  storyImportance?: StoryImportance;
  currentThreadFollowupCount?: number;
  followupBudget?: number;
  followupBudgetRemaining?: number;
  shouldAdvance?: boolean;
  lifePeriod?: LifePeriod;
  currentDomain?: LifeDomain;
  domainStatus?: DomainStatus;
  domainGoal?: string;
  domainsCompleted?: LifeDomain[];
  domainsRemaining?: LifeDomain[];
  shouldTransitionDomain?: boolean;
};

export type InterviewIntent = "story_answer" | "app_question" | "app_command" | "story_correction" | "story_addendum";
type DirectorIntent = Exclude<InterviewIntent, "story_correction" | "story_addendum">;
type CommandName = "repeat_question" | "slower" | "faster" | "larger_text" | "smaller_text" |
  "high_contrast" | "normal_contrast" | "pause" | "skip" | "go_back";
type InterviewCommand = { name: CommandName; value: string | null };
type Entities = { people: string[]; places: string[]; dates: string[]; organizations: string[] };

export type InterviewDirectorResult = {
  interview_intent: DirectorIntent;
  chronology_status: ChronologyStatus;
  approx_age_known: boolean;
  approx_year_known: boolean;
  place_known: boolean;
  current_life_period: string;
  current_topic: string;
  story_is_emerging: boolean;
  story_thread: string;
  director_note: string;
  question_objective: string;
  followup_value: FollowupValue;
  followup_reason: string;
  story_resolution_status: StoryResolutionStatus;
  story_importance: StoryImportance;
  current_thread_followup_count: number;
  followup_budget: number;
  followup_budget_remaining: number;
  should_advance: boolean;
  context_opportunity: ContextOpportunity;
  life_period: LifePeriod;
  current_domain: LifeDomain;
  domain_status: DomainStatus;
  domain_goal: string;
  domains_completed: LifeDomain[];
  domains_remaining: LifeDomain[];
  should_transition_domain: boolean;
  app_response: string;
  command: InterviewCommand | null;
  entities: Entities;
};

export type QuestionWriterResult = {
  next_question: string;
  contains_unstated_personal_fact: boolean;
  assumption_explanation: string;
};

export type InterviewDecision = Omit<InterviewDirectorResult, "app_response"> & QuestionWriterResult & {
  intent: InterviewIntent;
  speak_text: string;
};

const commandSchema = {
  anyOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        name: {
          type: "string",
          enum: [
            "repeat_question", "slower", "faster", "larger_text", "smaller_text",
            "high_contrast", "normal_contrast", "pause", "skip", "go_back",
          ],
        },
        value: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
      required: ["name", "value"],
    },
    { type: "null" },
  ],
};

const entitiesSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    people: { type: "array", items: { type: "string" } },
    places: { type: "array", items: { type: "string" } },
    dates: { type: "array", items: { type: "string" } },
    organizations: { type: "array", items: { type: "string" } },
  },
  required: ["people", "places", "dates", "organizations"],
};

export const INTERVIEW_DIRECTOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    interview_intent: { type: "string", enum: ["story_answer", "app_question", "app_command"] },
    director_note: { type: "string" },
    question_objective: { type: "string" },
    followup_value: { type: "string", enum: FOLLOWUP_VALUES },
    followup_reason: { type: "string" },
    story_resolution_status: { type: "string", enum: STORY_RESOLUTION_STATUSES },
    story_importance: { type: "string", enum: STORY_IMPORTANCE_VALUES },
    current_thread_followup_count: { type: "integer", minimum: 0 },
    followup_budget: { type: "integer", minimum: 0 },
    followup_budget_remaining: { type: "integer", minimum: 0 },
    story_thread: { type: "string" },
    current_life_period: { type: "string" },
    current_topic: { type: "string" },
    story_is_emerging: { type: "boolean" },
    should_advance: { type: "boolean" },
    chronology_status: { type: "string", enum: CHRONOLOGY_STATUSES },
    approx_age_known: { type: "boolean" },
    approx_year_known: { type: "boolean" },
    place_known: { type: "boolean" },
    context_opportunity: { type: "string", enum: CONTEXT_OPPORTUNITIES },
    life_period: { type: "string", enum: LIFE_PERIOD_VALUES },
    current_domain: { type: "string", enum: LIFE_DOMAIN_VALUES },
    domain_status: { type: "string", enum: DOMAIN_STATUS_VALUES },
    domain_goal: { type: "string" },
    domains_completed: { type: "array", items: { type: "string", enum: LIFE_DOMAIN_VALUES } },
    domains_remaining: { type: "array", items: { type: "string", enum: LIFE_DOMAIN_VALUES } },
    should_transition_domain: { type: "boolean" },
    app_response: { type: "string" },
    command: commandSchema,
    entities: entitiesSchema,
  },
  required: [
    "interview_intent", "director_note", "question_objective", "followup_value", "followup_reason",
    "story_resolution_status", "story_importance", "current_thread_followup_count", "followup_budget",
    "followup_budget_remaining", "story_thread", "current_life_period",
    "current_topic", "story_is_emerging", "should_advance", "chronology_status", "approx_age_known",
    "approx_year_known", "place_known", "context_opportunity", "life_period", "current_domain",
    "domain_status", "domain_goal", "domains_completed", "domains_remaining", "should_transition_domain",
    "app_response", "command", "entities",
  ],
};

export const QUESTION_WRITER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    next_question: { type: "string" },
    contains_unstated_personal_fact: { type: "boolean" },
    assumption_explanation: { type: "string" },
  },
  required: ["next_question", "contains_unstated_personal_fact", "assumption_explanation"],
};

type TurnArgs = {
  currentQuestion: string;
  transcript: string;
  storyHistory: StoryHistoryTurn[];
};

const emptyEntities = (): Entities => ({ people: [], places: [], dates: [], organizations: [] });

function contextInput(args: TurnArgs) {
  const history = args.storyHistory.slice(-20).map((turn, index) => [
    `TURN ${index + 1}`,
    `CHRONOLOGY_STATUS: ${turn.chronologyStatus ?? "unknown"}`,
    `LIFE_PERIOD: ${turn.currentLifePeriod ?? "unknown"}`,
    `TOPIC: ${turn.currentTopic ?? "unknown"}`,
    `STORY_THREAD: ${turn.storyThread ?? "unknown"}`,
    `STORY_EMERGING: ${turn.storyIsEmerging ?? "unknown"}`,
    `FOLLOWUP_VALUE: ${turn.followupValue ?? "unknown"}`,
    `FOLLOWUP_REASON: ${turn.followupReason ?? "unknown"}`,
    `STORY_RESOLUTION_STATUS: ${turn.storyResolutionStatus ?? "unknown"}`,
    `STORY_IMPORTANCE: ${turn.storyImportance ?? "unknown"}`,
    `CURRENT_THREAD_FOLLOWUP_COUNT: ${turn.currentThreadFollowupCount ?? "unknown"}`,
    `FOLLOWUP_BUDGET: ${turn.followupBudget ?? "unknown"}`,
    `FOLLOWUP_BUDGET_REMAINING: ${turn.followupBudgetRemaining ?? "unknown"}`,
    `SHOULD_ADVANCE: ${turn.shouldAdvance ?? "unknown"}`,
    `LIFE_PERIOD: ${turn.lifePeriod ?? "unknown"}`,
    `CURRENT_DOMAIN: ${turn.currentDomain ?? "unknown"}`,
    `DOMAIN_STATUS: ${turn.domainStatus ?? "unknown"}`,
    `DOMAIN_GOAL: ${turn.domainGoal ?? "unknown"}`,
    `DOMAINS_COMPLETED: ${(turn.domainsCompleted ?? []).join(", ") || "none"}`,
    `DOMAINS_REMAINING: ${(turn.domainsRemaining ?? []).join(", ") || "none"}`,
    `SHOULD_TRANSITION_DOMAIN: ${turn.shouldTransitionDomain ?? "unknown"}`,
    `Q: ${turn.question}`,
    `A: ${turn.answer}`,
  ].join("\n")).join("\n\n");
  return `CURRENT_QUESTION:\n${args.currentQuestion}\n\nSTORY_HISTORY:\n${history || "(none yet)"}\n\nCURRENT_TRANSCRIPT:\n${args.transcript}`;
}

function appDirector(
  interviewIntent: "app_question" | "app_command",
  appResponse: string,
  command: InterviewCommand | null,
): InterviewDirectorResult {
  const skipping = command?.name === "skip";
  return {
    interview_intent: interviewIntent,
    chronology_status: "unanchored",
    approx_age_known: false,
    approx_year_known: false,
    place_known: false,
    current_life_period: "the interrupted interview point",
    current_topic: "the interrupted interview question",
    story_is_emerging: false,
    story_thread: "resume the current interview question",
    director_note: skipping
      ? "The storyteller asked to skip, so move forward without adding the command to the life story."
      : "This is an app request, so handle it and preserve the exact interrupted interview question.",
    question_objective: skipping
      ? "Move forward with one broad grounded life-story question without inventing a new subject."
      : "Resume the exact current interview question after handling the app request.",
    followup_value: "low",
    followup_reason: "An app request does not create a story follow-up; preserve the interrupted story position.",
    story_resolution_status: "open",
    story_importance: "minor",
    current_thread_followup_count: 0,
    followup_budget: 0,
    followup_budget_remaining: 0,
    should_advance: skipping,
    context_opportunity: "none",
    life_period: "other",
    current_domain: "other",
    domain_status: "not_started",
    domain_goal: "Preserve the interrupted life-domain position.",
    domains_completed: [],
    domains_remaining: [],
    should_transition_domain: false,
    app_response: appResponse,
    command,
    entities: emptyEntities(),
  };
}

function storyDirector(overrides: Partial<InterviewDirectorResult> = {}): InterviewDirectorResult {
  return {
    interview_intent: "story_answer",
    chronology_status: "unanchored",
    approx_age_known: false,
    approx_year_known: false,
    place_known: false,
    current_life_period: "the current period in the storyteller's account",
    current_topic: "the current life-story thread",
    story_is_emerging: false,
    story_thread: "the next event in the supplied account",
    director_note: "The account is not yet anchored or developed into an event, so continue chronologically without introducing a subject.",
    question_objective: "Ask what happened next in the supplied account.",
    followup_value: "medium",
    followup_reason: "Meaningful chronology may reveal the next event in the supplied account.",
    story_resolution_status: "open",
    story_importance: "meaningful",
    current_thread_followup_count: 0,
    followup_budget: 2,
    followup_budget_remaining: 2,
    should_advance: true,
    context_opportunity: "none",
    life_period: "other",
    current_domain: "other",
    domain_status: "not_started",
    domain_goal: "Locate the next meaningful life period and domain without inventing one.",
    domains_completed: [],
    domains_remaining: [],
    should_transition_domain: false,
    app_response: "",
    command: null,
    entities: emptyEntities(),
    ...overrides,
  };
}

function hasApproxAge(text: string) {
  return /\b(?:i was|when i was|about|around|age)\s+(?:\d{1,2}|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty(?:-?one)?|twenty(?:-?two)?|twenty(?:-?three)?|twenty(?:-?four)?|twenty(?:-?five)?)\b/i.test(text);
}

function hasApproxYear(text: string) {
  return /\b(?:19|20)\d{2}\b/.test(text);
}

function threadBudget(args: TurnArgs, topic: string, requestedBudget: number) {
  const previous = args.storyHistory.at(-1);
  const continued = previous?.currentTopic === topic && previous.shouldAdvance !== true;
  const currentCount = continued ? (previous.currentThreadFollowupCount ?? 0) + 1 : 0;
  const budget = continued ? Math.max(previous.followupBudget ?? requestedBudget, requestedBudget) : requestedBudget;
  return {
    current_thread_followup_count: currentCount,
    followup_budget: budget,
    followup_budget_remaining: Math.max(budget - currentCount, 0),
  };
}

function uniqueDomains(domains: LifeDomain[]) {
  return [...new Set(domains)];
}

function domainFields(
  args: TurnArgs,
  lifePeriod: LifePeriod,
  currentDomain: LifeDomain,
  status: DomainStatus,
  goal: string,
  shouldTransition: boolean,
) {
  const previousCompleted = args.storyHistory.at(-1)?.domainsCompleted ?? [];
  const completed = uniqueDomains([
    ...previousCompleted,
    ...(status === "sufficient" ? [currentDomain] : []),
  ]);
  const roadmap = lifePeriod === "childhood" ? [...CHILDHOOD_DOMAINS] :
    lifePeriod === "adolescence" ? [...ADOLESCENCE_DOMAINS] : [];
  return {
    life_period: lifePeriod,
    current_domain: currentDomain,
    domain_status: status,
    domain_goal: goal,
    domains_completed: completed,
    domains_remaining: roadmap.filter((domain) => !completed.includes(domain)),
    should_transition_domain: shouldTransition,
  };
}

function domainDirector(args: TurnArgs): InterviewDirectorResult | null {
  const transcript = args.transcript.toLowerCase();
  const question = args.currentQuestion.toLowerCase();
  const previous = args.storyHistory.at(-1);
  const previousDomain = previous?.currentDomain;
  const hasDomainHistory = previousDomain != null && previousDomain !== "other";
  const explicitDomainQuestion = /\b(?:home life|family life|elementary school|middle school|junior high|high school|outside of school|outside school|what were you into|friends|social life)\b/i.test(question);

  // Preserve the existing minor-incident mock path when no broader school domain has been established yet.
  if (!hasDomainHistory && /\b(?:time you got in trouble at school|sports memory|first job)\b/i.test(question)) return null;
  if (!hasDomainHistory && !explicitDomainQuestion) return null;

  if (/\b(?:by|in) high school\b/.test(transcript) && /\b(?:job|work|worked|working)\b/.test(transcript)) {
    return storyDirector({
      ...domainFields(args, "adolescence", "work", "opening", "Understand the storyteller's work during high school at a broad life-domain level.", false),
      chronology_status: "partially_anchored",
      current_life_period: "high school",
      current_topic: "work during high school",
      story_thread: "how work fit into the storyteller's high-school life",
      director_note: "The storyteller explicitly moved from the prior domain to work during high school. Reorient to that supplied domain without losing the adolescent chronology.",
      question_objective: "Ask how the storyteller got the high-school job they introduced.",
      followup_value: "high",
      followup_reason: "How the work began can open a representative experience without chasing a detail.",
      story_resolution_status: "open",
      story_importance: "meaningful",
      should_advance: false,
    });
  }

  const schoolAnecdote = /\b(?:teacher caught|detention|stayed after school|got in trouble|fight in class|sent to the principal|passed a note)\b/.test(transcript);
  const schoolDomains: LifeDomain[] = ["elementary_school", "middle_school", "high_school"];
  if (previousDomain && schoolDomains.includes(previousDomain) &&
      (schoolAnecdote || /\b(?:incident|change anything about school)\b/.test(question))) {
    const lifePeriod: LifePeriod = previousDomain === "elementary_school" ? "childhood" : "adolescence";
    if (/\b(?:change anything about school|after that incident)\b/.test(question) || previous?.currentThreadFollowupCount === 1) {
      return storyDirector({
        ...domainFields(args, lifePeriod, previousDomain, "sufficient", "Return from the resolved anecdote to the broader school roadmap.", true),
        chronology_status: "partially_anchored",
        current_life_period: previousDomain.replaceAll("_", " "),
        current_topic: "the broader school period",
        story_thread: "school life beyond the completed anecdote",
        director_note: "The school anecdote has received its one useful consequence follow-up. It does not reset the domain, so return to the broader school-to-interests progression.",
        question_objective: "Transition from the completed school anecdote to what the storyteller was into outside school.",
        followup_value: "low",
        followup_reason: "Another anecdote detail would not add a new life-story dimension.",
        story_resolution_status: "resolved",
        story_importance: "minor",
        current_thread_followup_count: 1,
        followup_budget: 1,
        followup_budget_remaining: 0,
        should_advance: true,
      });
    }
    return storyDirector({
      ...domainFields(args, lifePeriod, previousDomain, "developing", "Take at most one useful consequence from the school anecdote, then return to the domain.", false),
      chronology_status: "partially_anchored",
      current_life_period: previousDomain.replaceAll("_", " "),
      current_topic: "a school anecdote",
      story_thread: "whether the supplied school incident changed anything meaningful",
      director_note: "A colorful school anecdote supports the domain but must not take it over. Allow one consequence question, then return to broader school life.",
      question_objective: "Ask whether the supplied school incident changed anything about school for the storyteller.",
      followup_value: "medium",
      followup_reason: "A consequence could add meaning; further incident detail would not.",
      story_resolution_status: "resolved",
      story_importance: "minor",
      current_thread_followup_count: 0,
      followup_budget: 1,
      followup_budget_remaining: 1,
      should_advance: false,
    });
  }

  const asksOutsideSchool = /\b(?:outside of school|outside school|what were you into)\b/.test(question);
  if (asksOutsideSchool) {
    const adolescent = previous?.lifePeriod === "adolescence" || previousDomain === "middle_school" || previousDomain === "high_school";
    const sport = /\b(?:box|boxing|baseball|basketball|football|soccer|tennis|wrestl|track|swim|sport|team)\b/.test(transcript);
    const friends = /\bfriends?\b/.test(transcript);
    const domain: LifeDomain = friends ? (adolescent ? "friends_social_life" : "neighborhood_friends") :
      sport ? (adolescent ? "sports_activities" : "sports") : "interests_hobbies";
    const lifePeriod: LifePeriod = adolescent ? "adolescence" : "childhood";
    return storyDirector({
      ...domainFields(args, lifePeriod, domain, "opening", "Open the supplied interest or activity without turning it into an unlimited anecdote thread.", false),
      chronology_status: "partially_anchored",
      current_life_period: adolescent ? "adolescence" : "childhood",
      current_topic: friends ? "friends and social life" : sport ? "the supplied sport or activity" : "the supplied childhood interest",
      story_thread: friends ? "what the storyteller and supplied friends usually did together" : "how the supplied interest began",
      director_note: "The broad school transition successfully opened a new activity domain. Ask one concrete opening question, then return to chronology rather than exhaust every detail.",
      question_objective: friends
        ? "Ask what the storyteller and their already-mentioned friends usually did together."
        : "Ask how the storyteller first got into the activity they supplied.",
      followup_value: "high",
      followup_reason: "How it began can produce one representative story within the new domain.",
      story_resolution_status: "open",
      story_importance: "meaningful",
      current_thread_followup_count: 0,
      followup_budget: 1,
      followup_budget_remaining: 1,
      should_advance: false,
    });
  }

  if ((previousDomain === "interests_hobbies" || previousDomain === "sports" || previousDomain === "sports_activities") &&
      /\b(?:how did you first get into|how did you get started)\b/.test(question)) {
    const adolescence = previous?.lifePeriod === "adolescence";
    return storyDirector({
      ...domainFields(args, previous!.lifePeriod!, previousDomain, "sufficient", "Close the brief activity mini-arc and return to the next chronological school period.", true),
      chronology_status: "transitioning",
      current_life_period: adolescence ? "adolescence" : "childhood",
      current_topic: "the completed activity domain",
      story_thread: "the next chronological school period",
      director_note: "The activity has an origin and one representative connection. That is sufficient for now, so return to the chronological life roadmap.",
      question_objective: adolescence
        ? "Transition to where the storyteller went to high school."
        : "Transition to where the storyteller went to middle school.",
      followup_value: "low",
      followup_reason: "The activity domain is sufficient and another detail is not needed.",
      story_resolution_status: "resolved",
      current_thread_followup_count: 1,
      followup_budget: 1,
      followup_budget_remaining: 0,
      should_advance: true,
    });
  }

  if (/\b(?:home life|family life)\b/.test(question)) {
    return storyDirector({
      ...domainFields(args, "childhood", "home_family", "opening", "Establish the broad rhythm and important relationships of childhood home life.", false),
      chronology_status: "unanchored",
      current_life_period: "childhood",
      current_topic: "home and family life",
      story_thread: "everyday life at home",
      director_note: "Home and family is the current childhood domain. Open its everyday pattern broadly rather than selecting one household detail.",
      question_objective: "Ask what everyday life at home looked like for the storyteller.",
      should_advance: false,
    });
  }

  if (previousDomain === "home_family" && /\beveryday life at home\b/.test(question)) {
    return storyDirector({
      ...domainFields(args, "childhood", "home_family", "sufficient", "Move from a sufficient home-life foundation to elementary school.", true),
      chronology_status: "transitioning",
      current_life_period: "childhood",
      current_topic: "home and family life",
      story_thread: "the transition from home life to elementary school",
      director_note: "The interview has a usable home-life foundation. Preserve its stories and move to the next childhood domain instead of collecting every household detail.",
      question_objective: "Transition naturally from childhood home life to elementary school.",
      followup_value: "low",
      followup_reason: "The next domain will add a new dimension of childhood.",
      story_resolution_status: "resolved",
      should_advance: true,
    });
  }

  if (/\belementary school\b/.test(question)) {
    return storyDirector({
      ...domainFields(args, "childhood", "elementary_school", "opening", "Establish the storyteller's broad elementary-school experience.", false),
      chronology_status: "partially_anchored",
      current_life_period: "childhood",
      current_topic: "elementary school",
      story_thread: "the storyteller's general experience as an elementary-school student",
      director_note: "Elementary school is the active childhood domain. Establish the storyteller's own broad experience before following any representative story.",
      question_objective: "Ask what kind of student the storyteller was in elementary school.",
      should_advance: false,
    });
  }

  if (previousDomain === "elementary_school" && /\bwhat kind of student\b/.test(question)) {
    return storyDirector({
      ...domainFields(args, "childhood", "elementary_school", "developing", "Learn one more broad dimension of elementary school before leaving the domain.", false),
      chronology_status: "partially_anchored",
      current_life_period: "childhood",
      current_topic: "elementary school",
      story_thread: "classes and learning during elementary school",
      director_note: "The school and general student identity are established. Ask one broad learning question rather than drilling into a newly mentioned detail.",
      question_objective: "Ask which classes the storyteller enjoyed in elementary school.",
      should_advance: false,
    });
  }

  if (previousDomain === "elementary_school" && /\bclasses did you enjoy\b/.test(question)) {
    return storyDirector({
      ...domainFields(args, "childhood", "elementary_school", "sufficient", "Leave elementary school for the storyteller's interests outside school.", true),
      chronology_status: "transitioning",
      current_life_period: "childhood",
      current_topic: "elementary school",
      story_thread: "the transition from elementary school to childhood interests",
      director_note: "Elementary school now has place, student character, and learning context. That is sufficient; transition to interests instead of exhausting school details.",
      question_objective: "Transition to what the storyteller was into outside elementary school.",
      followup_value: "low",
      followup_reason: "A new domain will broaden the childhood portrait.",
      story_resolution_status: "resolved",
      should_advance: true,
    });
  }

  if (/\b(?:where did you go to middle school|middle school|junior high)\b/.test(question)) {
    return storyDirector({
      ...domainFields(args, "adolescence", "middle_school", "opening", "Establish the broad middle-school period and its place in chronology.", false),
      chronology_status: "transitioning",
      current_life_period: "early adolescence",
      current_topic: "middle school",
      story_thread: "the storyteller's overall middle-school period",
      director_note: "The chronology has reached middle school. Open the period broadly before selecting any anecdote or activity.",
      question_objective: "Ask what the middle-school period was like for the storyteller.",
      should_advance: false,
    });
  }

  if (previousDomain === "middle_school" && /\bwhat was that period like\b/.test(question)) {
    return storyDirector({
      ...domainFields(args, "adolescence", "middle_school", "developing", "Open the storyteller's interests during middle school.", true),
      chronology_status: "partially_anchored",
      current_life_period: "early adolescence",
      current_topic: "middle school",
      story_thread: "activities and interests during middle school",
      director_note: "The broad middle-school period is established. Use the recurring interests transition to open another adolescent domain naturally.",
      question_objective: "Ask what the storyteller was into during middle school.",
      should_advance: true,
    });
  }

  if (/\bwhere did you go to high school\b/.test(question) || (hasDomainHistory && /\bhigh school\b/.test(question))) {
    return storyDirector({
      ...domainFields(args, "adolescence", "high_school", "opening", "Establish the storyteller's broad high-school experience.", false),
      chronology_status: "transitioning",
      current_life_period: "adolescence",
      current_topic: "high school",
      story_thread: "the storyteller's identity as a high-school student",
      director_note: "The chronology has reached high school. Open the domain with the storyteller's broad student identity, not a detail from the latest answer.",
      question_objective: "Ask what kind of student the storyteller was in high school.",
      should_advance: false,
    });
  }

  if (previousDomain === "high_school" && /\bwhat kind of student\b/.test(question)) {
    return storyDirector({
      ...domainFields(args, "adolescence", "high_school", "developing", "Understand one broad learning dimension of high school.", false),
      chronology_status: "partially_anchored",
      current_life_period: "adolescence",
      current_topic: "high school",
      story_thread: "classes and learning in high school",
      director_note: "The high-school setting and student identity are established. Ask one broad class question before moving to life outside school.",
      question_objective: "Ask which classes the storyteller liked in high school.",
      should_advance: false,
    });
  }

  if (previousDomain === "high_school" && /\bclasses did you like\b/.test(question)) {
    return storyDirector({
      ...domainFields(args, "adolescence", "high_school", "sufficient", "Move from sufficient high-school context to life outside school.", true),
      chronology_status: "partially_anchored",
      current_life_period: "adolescence",
      current_topic: "high school",
      story_thread: "the transition from school to adolescent activities and relationships",
      director_note: "The high-school domain has enough educational context. Broaden the life story by asking what occupied the storyteller outside school.",
      question_objective: "Transition to what the storyteller was into outside high school.",
      followup_value: "low",
      followup_reason: "The school domain is sufficient and another domain will add more value.",
      story_resolution_status: "resolved",
      should_advance: true,
    });
  }

  return null;
}

function mockDirector(args: TurnArgs): InterviewDirectorResult {
  const transcript = args.transcript.trim();
  const normalized = transcript.toLowerCase();
  const question = args.currentQuestion.toLowerCase();
  const historyText = args.storyHistory.map((turn) => `${turn.question} ${turn.answer}`).join(" ");
  const allText = `${historyText} ${args.currentQuestion} ${transcript}`;
  const priorTopic = args.storyHistory.at(-1)?.currentTopic;

  if (/^(please )?(repeat|talk slower|slow down|talk faster|pause|skip|go back)/.test(normalized)) {
    let name: CommandName = "repeat_question";
    if (normalized.includes("slow")) name = "slower";
    else if (normalized.includes("fast")) name = "faster";
    else if (normalized.includes("pause")) name = "pause";
    else if (normalized.includes("skip")) name = "skip";
    else if (normalized.includes("go back")) name = "go_back";
    return appDirector("app_command", "Okay.", { name, value: null });
  }
  const startsWhQuestion = /^(what|when|where|who|why|how)\b/.test(normalized) &&
    !/^(when|where|how) (i|we|my|our)\b/.test(normalized);
  if (normalized.endsWith("?") || startsWhQuestion) {
    return appDirector("app_question", "That information is not available in mock mode.", null);
  }

  const directedByDomain = domainDirector(args);
  if (directedByDomain) return directedByDomain;

  const ageKnown = hasApproxAge(allText);
  const yearKnown = hasApproxYear(allText);

  const lakeAccidentTopic = "father's lake accident";
  const lakeAccidentCurrent = /\b(?:dad|father)\b.*\b(?:fell|fall)\b.*\b(?:lake|water)\b|\b(?:almost|nearly) drowned\b/i.test(`${transcript} ${args.currentQuestion}`) ||
    priorTopic === lakeAccidentTopic;
  if (lakeAccidentCurrent) {
    const budget = threadBudget(args, lakeAccidentTopic, 2);
    const resolved = /\b(?:recovered|came home|back to normal|was okay|was all right)\b/i.test(transcript);
    if (budget.followup_budget_remaining === 0 && resolved) {
      return storyDirector({
        ...budget,
        chronology_status: ageKnown ? "partially_anchored" : "unanchored",
        approx_age_known: ageKnown,
        current_life_period: "the family period containing the lake accident",
        current_topic: lakeAccidentTopic,
        story_is_emerging: false,
        story_thread: "the resolved lake accident and its family impact",
        director_note: "The accident, recovery, and family impact have been established, and the two useful follow-ups are spent. Hospital, sibling, conversation, and living-arrangement logistics would add completeness rather than quality, so move forward.",
        question_objective: "Move forward to the next meaningful change in the storyteller's life after the resolved lake accident.",
        followup_value: "low",
        followup_reason: "The resolved meaningful event has reached its budget without opening another high-value thread.",
        story_resolution_status: "resolved",
        story_importance: "meaningful",
        should_advance: true,
      });
    }
    if (/\b(?:pulled|rescued|hospital|recovered|came home)\b/i.test(transcript)) {
      return storyDirector({
        ...budget,
        chronology_status: ageKnown ? "partially_anchored" : "unanchored",
        approx_age_known: ageKnown,
        current_life_period: "the family period containing the lake accident",
        current_topic: lakeAccidentTopic,
        story_is_emerging: true,
        story_thread: "the lake accident's effect on the family",
        director_note: "The rescue and outcome are clear. Use the one remaining question for possible family impact, not hospital logistics or a sequence of individual reactions.",
        question_objective: "Determine whether the lake accident changed anything important for the storyteller's family afterward.",
        followup_value: "medium",
        followup_reason: "One significance question may reveal a family consequence beyond the resolved accident.",
        story_resolution_status: "resolved",
        story_importance: "meaningful",
        should_advance: false,
      });
    }
    return storyDirector({
      ...budget,
      chronology_status: ageKnown ? "partially_anchored" : "unanchored",
      approx_age_known: ageKnown,
      current_life_period: "the family period containing the lake accident",
      current_topic: lakeAccidentTopic,
      story_is_emerging: true,
      story_thread: "the seriousness and outcome of the father's lake accident",
      director_note: "A meaningful family accident has opened, but its seriousness and outcome are unclear. Ask one direct question about that central consequence, not surrounding logistics.",
      question_objective: "Establish how serious the father's lake accident was.",
      followup_value: "high",
      followup_reason: "The unresolved outcome is central to understanding the event's consequence.",
      story_resolution_status: "open",
      story_importance: "meaningful",
      should_advance: false,
    });
  }

  const majorEventTopic = "house fire and its long-term impact";
  const majorEventCurrent = /\b(?:house|home)\b.*\b(?:burned|burnt|fire)\b/i.test(`${transcript} ${args.currentQuestion}`) ||
    priorTopic === majorEventTopic;
  if (majorEventCurrent) {
    const extendsForTurningPoint = priorTopic === majorEventTopic &&
      /\b(?:reconciled|made peace|called (?:him|my father)|stopped speaking|did not speak|didn't speak)\b/i.test(transcript);
    const budget = threadBudget(args, majorEventTopic, extendsForTurningPoint ? 4 : 3);
    if (budget.followup_budget_remaining === 0 && /\b(?:made peace|were close|until he died|that resolved it)\b/i.test(transcript)) {
      return storyDirector({
        ...budget,
        chronology_status: "partially_anchored",
        current_life_period: "the period after the house fire",
        current_topic: majorEventTopic,
        story_is_emerging: false,
        story_thread: "the resolved long-term impact of the house fire",
        director_note: "The major event received extended depth because it opened relocation, family change, conflict, and reconciliation. Those dimensions now have resolution, so further detail would spend storyteller energy without opening a new thread.",
        question_objective: "Advance to the next major change in the storyteller's life after the resolved house-fire period.",
        followup_value: "low",
        followup_reason: "The extended major-event budget is exhausted and its long-term relationship consequence is resolved.",
        story_resolution_status: "resolved",
        story_importance: "major",
        should_advance: true,
      });
    }
    if (/\b(?:reconciled|called (?:him|my father)|made peace)\b/i.test(transcript)) {
      return storyDirector({
        ...budget,
        chronology_status: "partially_anchored",
        current_life_period: "the period after the house fire",
        current_topic: majorEventTopic,
        story_is_emerging: true,
        story_thread: "the decision that led to reconciliation with the storyteller's father",
        director_note: "A new decision and reconciliation extend this major event beyond the normal budget. Use the single extension to understand that turning point, not to collect more fire logistics.",
        question_objective: "Learn what led the storyteller to call their father and begin the established reconciliation.",
        followup_value: "high",
        followup_reason: "The supplied reconciliation introduces a new decision and relationship turning point.",
        story_resolution_status: "developing",
        story_importance: "major",
        should_advance: false,
      });
    }
    if (/\b(?:stopped speaking|did not speak|didn't speak|second mother)\b/i.test(transcript)) {
      return storyDirector({
        ...budget,
        chronology_status: "partially_anchored",
        current_life_period: "the period after the house fire",
        current_topic: majorEventTopic,
        story_is_emerging: true,
        story_thread: "the established relationship change following the fire",
        director_note: "The fire's aftermath has opened a major relationship change. Spend the remaining normal budget on that consequence rather than reconstruction logistics.",
        question_objective: "Explore how the established post-fire period changed the storyteller's relationship with their father.",
        followup_value: "high",
        followup_reason: "The answer opens a major relationship conflict and possible long-term impact.",
        story_resolution_status: "developing",
        story_importance: "major",
        should_advance: false,
      });
    }
    if (/\b(?:moved in|relatives|changed schools?|new school)\b/i.test(transcript)) {
      return storyDirector({
        ...budget,
        chronology_status: "partially_anchored",
        current_life_period: "the period after the house fire",
        current_topic: majorEventTopic,
        story_is_emerging: true,
        story_thread: "the family and relationship changes caused by the fire",
        director_note: "The fire caused relocation and a school transition. Ask about the relationship dimension those changes opened, not how the temporary arrangements worked.",
        question_objective: "Determine whether the supplied post-fire changes affected the storyteller's family relationships.",
        followup_value: "high",
        followup_reason: "The relocation opens a potentially major relationship consequence.",
        story_resolution_status: "developing",
        story_importance: "major",
        should_advance: false,
      });
    }
    return storyDirector({
      ...budget,
      chronology_status: "partially_anchored",
      current_life_period: "the period of the house fire",
      current_topic: majorEventTopic,
      story_is_emerging: true,
      story_thread: "the life changes caused by the house fire",
      director_note: "The house fire is a major event with clear potential for long-term consequence. Begin with the most important change it caused rather than reconstructing emergency logistics.",
      question_objective: "Understand the most important change the house fire caused in the storyteller's life at that time.",
      followup_value: "high",
      followup_reason: "A major life-changing event warrants exploring its central consequence.",
      story_resolution_status: "developing",
      story_importance: "major",
      should_advance: false,
    });
  }

  const smokingMischiefCurrent = /\b(?:smok(?:e|ed|ing)|shed|cigarettes?)\b/i.test(`${transcript} ${args.currentQuestion}`) ||
    priorTopic === "smoking in the shed";
  if (smokingMischiefCurrent) {
    const budget = threadBudget(args, "smoking in the shed", 1);
    const base = {
      ...budget,
      chronology_status: ageKnown ? "partially_anchored" as const : "unanchored" as const,
      approx_age_known: ageKnown,
      approx_year_known: yearKnown,
      current_life_period: "childhood",
      current_topic: "smoking in the shed",
      story_is_emerging: true,
      story_thread: "the childhood smoking incident and its consequences",
      context_opportunity: "none" as const,
      story_importance: "minor" as const,
    };
    if (/\b(?:stopped|quit|never|did not|didn't)\b.*\bsmok/i.test(transcript) ||
        /did getting caught change/i.test(question)) {
      return storyDirector({
        ...base,
        story_is_emerging: false,
        director_note: "The incident and its behavioral consequence are both resolved. Another incident-level question would only prolong an understood story, so return to the broader childhood chronology.",
        question_objective: "Move forward to the next meaningful part of the storyteller's childhood.",
        followup_value: "low",
        followup_reason: "Staying with the incident is unlikely to reveal a new dimension after its outcome and behavior change are known.",
        story_resolution_status: "resolved",
        should_advance: true,
      });
    }
    if (/\b(?:got sick|felt sick|caught|grounded)\b/i.test(transcript)) {
      if (budget.followup_budget_remaining === 0) {
        return storyDirector({
          ...base,
          story_is_emerging: false,
          director_note: "The minor mischief story now has a consequence and resolution, and its single useful follow-up is spent. Move forward instead of asking about punishment logistics or another aftermath detail.",
          question_objective: "Move forward to the next meaningful part of the storyteller's childhood.",
          followup_value: "low",
          followup_reason: "The resolved minor anecdote has exhausted its one-question budget without opening a major new thread.",
          story_resolution_status: "resolved",
          should_advance: true,
        });
      }
      return storyDirector({
        ...base,
        director_note: "The smoking incident now has a clear outcome. One focused behavior-change question has value; generic questions about the grounding or what happened immediately afterward do not.",
        question_objective: "Determine whether getting caught changed the storyteller's smoking behavior afterward.",
        followup_value: "medium",
        followup_reason: "A single question about behavior change can reveal a consequence beyond the already-resolved incident.",
        story_resolution_status: "resolved",
        should_advance: false,
      });
    }
    return storyDirector({
      ...base,
      director_note: "A concrete childhood incident has begun but no outcome is supplied. Follow its central action once to learn the consequence, without probing the shed or cigarettes as objects.",
      question_objective: "Invite the storyteller to say how the childhood smoking incident unfolded.",
      followup_value: "high",
      followup_reason: "The unresolved action is likely to reveal a consequence or conflict.",
      story_resolution_status: "developing",
      should_advance: false,
    });
  }

  const parentTroubleCurrent = /\b(?:broke curfew|came home late|trouble with (?:my )?parents|parents? (?:caught|grounded))\b/i.test(`${transcript} ${args.currentQuestion}`) ||
    priorTopic === "trouble with parents";
  if (parentTroubleCurrent) {
    const budget = threadBudget(args, "trouble with parents", 1);
    const base = {
      ...budget,
      chronology_status: ageKnown ? "partially_anchored" as const : "unanchored" as const,
      approx_age_known: ageKnown,
      current_life_period: "the storyteller's youth",
      current_topic: "trouble with parents",
      story_thread: "the established conflict with the storyteller's parents",
      story_resolution_status: "resolved" as const,
      context_opportunity: "none" as const,
      story_importance: "minor" as const,
    };
    if (/first time.*trouble/i.test(question) || /\b(?:settled|that was (?:really )?it|nothing (?:else|more))\b/i.test(transcript)) {
      return storyDirector({
        ...base,
        story_is_emerging: false,
        director_note: "The parent conflict is resolved and the final relationship check opened no richer thread. Protect momentum by returning to the broader period of the storyteller's youth.",
        question_objective: "Advance to the next meaningful part of the storyteller's youth.",
        followup_value: "low",
        followup_reason: "Another question about the resolved conflict would likely produce only incident detail.",
        should_advance: true,
      });
    }
    return storyDirector({
      ...base,
      story_is_emerging: true,
      director_note: "The curfew incident has an outcome. One focused chronology-and-relationship question may show whether it marked a larger pattern; do not mine the punishment itself.",
      question_objective: "Determine whether this was the storyteller's first serious trouble with their parents.",
      followup_value: "medium",
      followup_reason: "One focused question may locate the incident within an established parent relationship.",
      should_advance: false,
    });
  }

  const schoolIncidentCurrent = /\b(?:passing|passed) (?:a )?note\b|\bstay(?:ed)? after school\b/i.test(`${transcript} ${args.currentQuestion}`) ||
    priorTopic === "minor school incident";
  if (schoolIncidentCurrent) {
    const budget = threadBudget(args, "minor school incident", 1);
    if (/\b(?:caught|stay(?:ed)? after school|detention)\b/i.test(transcript)) {
      return storyDirector({
        ...budget,
        chronology_status: ageKnown ? "partially_anchored" : "unanchored",
        approx_age_known: ageKnown,
        current_life_period: "school years",
        current_topic: "minor school incident",
        story_is_emerging: false,
        story_thread: "the resolved note-passing incident",
        director_note: "The minor school incident already has an action and outcome, with no larger consequence supplied. A further incident question would only seek more detail, so move back to the school-years story.",
        question_objective: "Return to the broader school-years story and invite the next meaningful experience from that period.",
        followup_value: "low",
        followup_reason: "The resolved minor incident offers no supplied sign of a larger consequence, relationship, or turning point.",
        story_resolution_status: "resolved",
        story_importance: "minor",
        should_advance: true,
      });
    }
    return storyDirector({
      ...budget,
      current_life_period: "school years",
      current_topic: "minor school incident",
      story_is_emerging: true,
      story_thread: "the unresolved note-passing incident",
      director_note: "The storyteller has begun a concrete school incident without giving its outcome. One question about the central action may complete it.",
      question_objective: "Ask what happened when the storyteller passed the note in class.",
      followup_value: "high",
      followup_reason: "The unresolved action is likely to reveal the incident's consequence.",
      story_resolution_status: "open",
      story_importance: "minor",
      should_advance: false,
    });
  }

  const firstJobAnecdoteCurrent = /\b(?:dropped|broke)\b.*\b(?:tray|glasses?|dishes?)\b/i.test(`${transcript} ${args.currentQuestion}`) ||
    priorTopic === "first job anecdote";
  if (firstJobAnecdoteCurrent) {
    const budget = threadBudget(args, "first job anecdote", 1);
    if (/\b(?:more careful|that was (?:really )?it|nothing (?:else|more))\b/i.test(transcript) ||
        /change how you approached/i.test(question)) {
      return storyDirector({
        ...budget,
        chronology_status: "partially_anchored",
        current_life_period: "early working life",
        current_topic: "first job anecdote",
        story_is_emerging: false,
        story_thread: "the resolved first-job mishap",
        director_note: "The workplace mishap and its effect on the storyteller are understood. No new thread emerged, so move forward in the working-life chronology.",
        question_objective: "Move forward to the next meaningful development in the storyteller's working life.",
        followup_value: "low",
        followup_reason: "Another question about the mishap would repeat an already-supplied consequence.",
        story_resolution_status: "resolved",
        story_importance: "minor",
        should_advance: true,
      });
    }
    return storyDirector({
      ...budget,
      chronology_status: "partially_anchored",
      current_life_period: "early working life",
      current_topic: "first job anecdote",
      story_is_emerging: true,
      story_thread: "the resolved mishap at the storyteller's first job",
      director_note: "The job anecdote has a complete outcome. One focused consequence question may show whether it changed the storyteller's behavior at work; avoid asking for more mishap detail.",
      question_objective: "Determine whether the first-job mishap changed how the storyteller approached the job afterward.",
      followup_value: "medium",
      followup_reason: "A behavior-change question can reveal a lasting consequence of the resolved anecdote.",
      story_resolution_status: "resolved",
      story_importance: "minor",
      should_advance: false,
    });
  }

  const sportsMemoryCurrent = /\b(?:championship game|winning basket|winning goal)\b/i.test(`${transcript} ${args.currentQuestion}`) ||
    priorTopic === "sports memory";
  if (sportsMemoryCurrent) {
    const budget = threadBudget(args, "sports memory", 1);
    if (/\bseason was over\b|\bthat was (?:really )?it\b/i.test(transcript) || /what did winning.*mean/i.test(question)) {
      return storyDirector({
        ...budget,
        chronology_status: "partially_anchored",
        current_life_period: "the period of the storyteller's sport",
        current_topic: "sports memory",
        story_is_emerging: false,
        story_thread: "the completed sports season",
        director_note: "The game, its meaning, and the end of the season are established. Further game questions would diminish momentum, so move forward beyond that sports period.",
        question_objective: "Move forward to what came next in the storyteller's life after that sports season.",
        followup_value: "low",
        followup_reason: "The memorable event and its significance are complete, leaving no important unresolved thread.",
        story_resolution_status: "resolved",
        story_importance: "meaningful",
        should_advance: true,
      });
    }
    return storyDirector({
      ...budget,
      chronology_status: "partially_anchored",
      current_life_period: "the period of the storyteller's sport",
      current_topic: "sports memory",
      story_is_emerging: true,
      story_thread: "the championship-game memory",
      director_note: "The championship game has a complete outcome. One concise significance question may reveal why it belongs in the life story; do not ask for play-by-play detail.",
      question_objective: "Learn what winning the established championship game meant to the storyteller at the time.",
      followup_value: "medium",
      followup_reason: "A significance question may reveal why this resolved event remains memorable.",
      story_resolution_status: "resolved",
      story_importance: "meaningful",
      should_advance: false,
    });
  }

  const boxingCurrent = /\bbox(?:ed|ing)?\b/.test(`${transcript} ${args.currentQuestion}`) || priorTopic === "boxing";
  if (boxingCurrent) {
    const base = {
      approx_age_known: ageKnown,
      approx_year_known: yearKnown,
      place_known: /\b(?:at|in) (?:the )?ymca\b/i.test(allText),
      current_life_period: "childhood",
      current_topic: "boxing",
      story_thread: "boxing became a meaningful childhood activity",
      should_advance: false,
      entities: { ...emptyEntities(), organizations: /ymca/i.test(allText) ? ["YMCA"] : [] },
    };
    if (/\b(?:one|a) fight\b.*\bymca\b|\bfight at (?:the )?ymca\b/i.test(transcript)) {
      return storyDirector({
        ...base,
        chronology_status: ageKnown ? "anchored" : "partially_anchored",
        story_is_emerging: true,
        story_thread: "the specific fight at the YMCA",
        director_note: "A specific fight is now opening into an event. Stop gathering boxing facts and follow what happened in that fight.",
        question_objective: "Invite the storyteller to continue what happened in the specific fight already introduced.",
        context_opportunity: "none",
      });
    }
    if (/\bfought a few times\b|\bfought competitively\b|\bcompetitive fights?\b/i.test(transcript)) {
      return storyDirector({
        ...base,
        chronology_status: ageKnown ? "anchored" : "partially_anchored",
        story_is_emerging: true,
        director_note: "Competitive fighting is now established, creating a concrete opportunity for a remembered event rather than another general boxing question.",
        question_objective: "Invite the storyteller to identify a particular fight they still remember.",
        context_opportunity: "none",
      });
    }
    if (/how did (?:your )?brother get you started|where did you box|where.*train/.test(question)) {
      return storyDirector({
        ...base,
        chronology_status: ageKnown ? "anchored" : "partially_anchored",
        story_is_emerging: /\b(?:brother|coach|friend|father|mother)\b/i.test(transcript),
        director_note: "The entry into boxing is becoming a relationship or scene. Follow the supplied action before moving to another boxing fact.",
        question_objective: "Ask what happened as the storyteller first began boxing, following only the supplied entry story.",
        context_opportunity: "none",
      });
    }
    if (/how did you (?:first )?get into boxing/.test(question)) {
      return storyDirector({
        ...base,
        chronology_status: "anchored",
        story_is_emerging: true,
        story_thread: /brother/i.test(transcript) ? "how the storyteller's brother got them into boxing" : base.story_thread,
        director_note: /brother/i.test(transcript)
          ? "The storyteller's brother is part of how boxing began. Follow how that happened rather than switching to a generic sports question."
          : "The start of boxing is becoming an event. Follow the supplied action before collecting another fact.",
        question_objective: /brother/i.test(transcript)
          ? "Explore how the storyteller's brother got them started in boxing."
          : "Explore how the storyteller first began boxing, using only the supplied action.",
        context_opportunity: "none",
      });
    }
    if (/how old.*start.*box/.test(question) || ageKnown) {
      return storyDirector({
        ...base,
        chronology_status: "partially_anchored",
        director_note: "The age anchor is established. Now open the boxing story by learning how the storyteller first got involved.",
        question_objective: "Learn how the storyteller first got into boxing.",
        context_opportunity: "none",
      });
    }
    return storyDirector({
      ...base,
      chronology_status: "needs_age_anchor",
      story_is_emerging: true,
      director_note: "Boxing appears to be a meaningful childhood activity, but we do not yet know when it began. Establish age first, then explore how the storyteller got involved and whether they actually fought.",
      question_objective: "Establish how old the storyteller was when they began boxing.",
      context_opportunity: "need_age",
    });
  }

  const firstJobCurrent = /\bfirst job\b/i.test(`${transcript} ${args.currentQuestion}`) || priorTopic === "first job";
  if (firstJobCurrent) {
    const budget = threadBudget(args, "first job", 2);
    const base = {
      ...budget,
      approx_age_known: ageKnown,
      approx_year_known: yearKnown,
      place_known: /\b(?:at|in) [a-z]+(?: [a-z]+){0,2}\b/i.test(transcript),
      current_life_period: "the storyteller's entry into working life",
      current_topic: "first job",
      story_thread: "how the storyteller entered their first job and what happened there",
      story_importance: "meaningful" as const,
      should_advance: false,
    };
    const advanceFromFirstJob = () => storyDirector({
      ...base,
      story_is_emerging: false,
      story_thread: "the completed first-job thread",
      director_note: "The useful first-job dimensions are established and the budget is spent. Move forward in working life instead of reconstructing tasks, routines, or workplace logistics.",
      question_objective: "Move forward to the next meaningful development in the storyteller's working life.",
      followup_value: "low",
      followup_reason: "The first-job thread has used its budget without opening another high-value dimension.",
      story_resolution_status: "resolved",
      should_advance: true,
    });
    if (/what mattered most.*job/.test(question) || budget.followup_budget_remaining === 0) {
      return advanceFromFirstJob();
    }
    if (/how did you get (?:that|your first) job/.test(question)) {
      return storyDirector({
        ...base,
        chronology_status: "anchored",
        story_is_emerging: true,
        director_note: "How the job began is now clear enough. Use the one remaining question for what mattered about that first working experience, not the mechanics of how the introduction unfolded.",
        question_objective: "Learn what mattered most to the storyteller about their first job.",
        followup_value: "medium",
        followup_reason: "One significance question may reveal why this first job belongs in the life story.",
        story_resolution_status: "developing",
        context_opportunity: "none",
      });
    }
    if (/how old.*(?:first job|start)/.test(question) || ageKnown) {
      return storyDirector({
        ...base,
        chronology_status: "partially_anchored",
        story_is_emerging: false,
        director_note: "The first job is now located by age. The next useful move is to open the story of how the storyteller got it.",
        question_objective: "Learn how the storyteller got their first job.",
        context_opportunity: "none",
      });
    }
    return storyDirector({
      ...base,
      chronology_status: "needs_age_anchor",
      story_is_emerging: true,
      director_note: "A first job is a meaningful life transition, but its timing is not established. Anchor the storyteller's age before developing how the job began.",
      question_objective: "Establish how old the storyteller was when they started their first job.",
      context_opportunity: "need_age",
    });
  }

  const moveCurrent = /\b(?:move|moved|moving)\b/i.test(`${transcript} ${args.currentQuestion}`) || priorTopic === "move to a new city";
  if (moveCurrent) {
    const placeKnown = /\b(?:moved|move|moving) to [a-z]+/i.test(allText);
    const base = {
      approx_age_known: ageKnown,
      approx_year_known: yearKnown,
      place_known: placeKnown,
      current_life_period: "the period of the established move",
      current_topic: "move to a new city",
      story_thread: "what led to the move and what changed afterward",
      should_advance: false,
    };
    if (/what led to (?:the|that) move/.test(question)) {
      return storyDirector({
        ...base,
        chronology_status: "transitioning",
        story_is_emerging: true,
        director_note: "The reason or event behind the move is now emerging. Follow the transition into what happened as the move unfolded.",
        question_objective: "Ask what happened next as the established move unfolded.",
        context_opportunity: yearKnown && placeKnown ? "date_place_ready" : "none",
      });
    }
    if (/how old.*move/.test(question) || ageKnown) {
      return storyDirector({
        ...base,
        chronology_status: "transitioning",
        story_is_emerging: false,
        director_note: "The move is anchored by age and place. Now open the transition by learning what led to it.",
        question_objective: "Learn what led to the established move without suggesting a reason.",
        context_opportunity: "none",
      });
    }
    return storyDirector({
      ...base,
      chronology_status: "needs_age_anchor",
      story_is_emerging: false,
      director_note: "The move opens a major transition, but the storyteller's age is not yet known. Establish age before developing what led to the move.",
      question_objective: "Establish approximately how old the storyteller was at the time of the move.",
      context_opportunity: "need_age",
    });
  }

  const militaryCurrent = /\b(?:army|military|enlisted|joined the service)\b/i.test(`${transcript} ${args.currentQuestion}`) || priorTopic === "joining the military";
  if (militaryCurrent) {
    const base = {
      approx_age_known: ageKnown,
      approx_year_known: yearKnown,
      place_known: false,
      current_life_period: "entry into military service",
      current_topic: "joining the military",
      story_thread: "the decision and transition into military service",
      should_advance: false,
    };
    if (/what led you to join/.test(question)) {
      return storyDirector({
        ...base,
        chronology_status: "transitioning",
        story_is_emerging: true,
        director_note: "The reason for joining now opens the transition into service. Follow what happened as that decision became action.",
        question_objective: "Ask what happened next as the storyteller entered military service.",
        context_opportunity: "none",
      });
    }
    if (/how old.*join/.test(question) || ageKnown) {
      return storyDirector({
        ...base,
        chronology_status: "transitioning",
        story_is_emerging: false,
        director_note: "The age of entry is established. Now explore what led to the decision to join rather than asking generally about the military.",
        question_objective: "Learn what led the storyteller to join the military.",
        context_opportunity: "none",
      });
    }
    return storyDirector({
      ...base,
      chronology_status: "needs_age_anchor",
      story_is_emerging: false,
      director_note: "Joining the military is a major transition, but its timing is not anchored. Establish the storyteller's age first.",
      question_objective: "Establish how old the storyteller was when they joined the military.",
      context_opportunity: "need_age",
    });
  }

  const spouseCurrent = /\b(?:wife|husband|spouse)\b/i.test(`${transcript} ${args.currentQuestion}`) || priorTopic === "meeting a spouse";
  if (spouseCurrent) {
    const base = {
      approx_age_known: ageKnown,
      approx_year_known: yearKnown,
      place_known: /\b(?:at|in) (?:a|the) [a-z]+/i.test(allText),
      current_life_period: "the period when the storyteller met their spouse",
      current_topic: "meeting a spouse",
      story_thread: "how the storyteller and their spouse first met",
      should_advance: false,
    };
    if (/how did you meet/.test(question)) {
      return storyDirector({
        ...base,
        chronology_status: "anchored",
        story_is_emerging: true,
        director_note: "The meeting has opened into a specific scene. Follow what happened when they met instead of switching to a generic relationship question.",
        question_objective: "Invite the storyteller to continue what happened when they met their spouse.",
        context_opportunity: yearKnown && base.place_known ? "date_place_ready" : "none",
      });
    }
    if (/how old.*meet/.test(question) || ageKnown) {
      return storyDirector({
        ...base,
        chronology_status: "partially_anchored",
        story_is_emerging: false,
        director_note: "The meeting is anchored by age. The next move is the simple story-opening question of how they met.",
        question_objective: "Ask how the storyteller met their spouse.",
        context_opportunity: "none",
      });
    }
    return storyDirector({
      ...base,
      chronology_status: "needs_age_anchor",
      story_is_emerging: false,
      director_note: "Meeting a spouse is a meaningful relationship milestone, but its place in the life story is not anchored. Establish age first.",
      question_objective: "Establish approximately how old the storyteller was when they met their spouse.",
      context_opportunity: "need_age",
    });
  }

  const activityCurrent = /\b(?:fishing|fish|model airplanes?|played baseball|rode horses?|danced|dance lessons?)\b/i.test(`${transcript} ${args.currentQuestion}`) || priorTopic === "childhood activity";
  if (activityCurrent) {
    const base = {
      approx_age_known: ageKnown,
      approx_year_known: yearKnown,
      place_known: false,
      current_life_period: "childhood",
      current_topic: "childhood activity",
      story_thread: "how the childhood activity became part of the storyteller's life",
      should_advance: false,
    };
    if (/how did you (?:first )?get into/.test(question)) {
      return storyDirector({
        ...base,
        chronology_status: "anchored",
        story_is_emerging: true,
        director_note: "The activity now contains a supplied person or action. Follow that beginning as a scene rather than asking another general activity question.",
        question_objective: "Explore how the supplied person or action introduced the storyteller to the childhood activity.",
        context_opportunity: "none",
      });
    }
    if (/how old.*start/.test(question) || ageKnown) {
      return storyDirector({
        ...base,
        chronology_status: "partially_anchored",
        story_is_emerging: false,
        director_note: "The childhood activity is anchored by age. Now open a story by asking how it began.",
        question_objective: "Learn how the storyteller first got into the established childhood activity.",
        context_opportunity: "none",
      });
    }
    return storyDirector({
      ...base,
      chronology_status: "needs_age_anchor",
      story_is_emerging: false,
      director_note: "The childhood activity may hold real experience, but its timing is unclear. Establish age before developing how it began.",
      question_objective: "Establish approximately how old the storyteller was when the childhood activity began.",
      context_opportunity: "need_age",
    });
  }

  if (/\bdrove all night\b/i.test(transcript)) {
    return storyDirector({
      chronology_status: "partially_anchored",
      current_life_period: "the period containing the overnight journey",
      current_topic: "the overnight journey",
      story_is_emerging: true,
      story_thread: "what happened at the end of the overnight journey",
      director_note: "The overnight drive is a completed action. Ignore the vehicle description and follow what happened upon arrival.",
      question_objective: "Ask what happened when the storyteller reached the destination.",
      should_advance: true,
      context_opportunity: "need_place",
    });
  }

  if (/\b(?:mom|mother)\b/i.test(transcript) && /\b(?:dad|father)\b/i.test(transcript)) {
    return storyDirector({
      chronology_status: "partially_anchored",
      current_life_period: "childhood",
      current_topic: "family life during childhood",
      story_is_emerging: false,
      story_thread: "the family's recurring pattern during that period",
      director_note: "The answer establishes a family pattern. Ignore incidental food, television, and scenery and invite the routine to unfold at the family level.",
      question_objective: "Invite the storyteller to describe how those family evenings usually unfolded.",
      should_advance: false,
      context_opportunity: "need_age",
    });
  }

  return storyDirector();
}

export async function directNextTurn(args: TurnArgs): Promise<InterviewDirectorResult> {
  if (providers.interview === "mock") return mockDirector(args);
  const response = await openai.responses.create({
    model: config.openaiInterviewModel,
    store: false,
    reasoning: { effort: "low" },
    instructions: INTERVIEW_DIRECTOR_INSTRUCTIONS,
    input: contextInput(args),
    text: {
      verbosity: "low",
      format: { type: "json_schema", name: "interview_direction", strict: true, schema: INTERVIEW_DIRECTOR_SCHEMA },
    },
  });
  return JSON.parse(response.output_text) as InterviewDirectorResult;
}

function mockQuestion(direction: InterviewDirectorResult): string {
  switch (direction.question_objective) {
    case "Ask what everyday life at home looked like for the storyteller.": return "What did everyday life at home look like for you?";
    case "Transition naturally from childhood home life to elementary school.": return "What was elementary school like for you?";
    case "Ask what kind of student the storyteller was in elementary school.": return "What kind of student were you?";
    case "Ask which classes the storyteller enjoyed in elementary school.": return "What classes did you enjoy?";
    case "Transition to what the storyteller was into outside elementary school.": return "What were you into outside of school?";
    case "Ask what the middle-school period was like for the storyteller.": return "What was that period like for you?";
    case "Ask what the storyteller was into during middle school.": return "What were you into then?";
    case "Ask what kind of student the storyteller was in high school.": return "What kind of student were you by then?";
    case "Ask which classes the storyteller liked in high school.": return "What classes did you like?";
    case "Transition to what the storyteller was into outside high school.": return "What were you into outside of school?";
    case "Ask how the storyteller first got into the activity they supplied.": return "How did you first get into that?";
    case "Ask what the storyteller and their already-mentioned friends usually did together.": return "What did you and your friends usually do together?";
    case "Transition to where the storyteller went to middle school.": return "Where did you go to middle school?";
    case "Transition to where the storyteller went to high school.": return "Where did you go to high school?";
    case "Ask whether the supplied school incident changed anything about school for the storyteller.": return "Did that change anything about school for you?";
    case "Transition from the completed school anecdote to what the storyteller was into outside school.": return "What were you into outside of school?";
    case "Ask how the storyteller got the high-school job they introduced.": return "How did you get that job?";
    case "Establish how serious the father's lake accident was.": return "How serious was your father's accident?";
    case "Determine whether the lake accident changed anything important for the storyteller's family afterward.": return "Did that accident change anything important for your family afterward?";
    case "Move forward to the next meaningful change in the storyteller's life after the resolved lake accident.": return "What came next for you after that?";
    case "Understand the most important change the house fire caused in the storyteller's life at that time.": return "How did the fire change your life at that time?";
    case "Determine whether the supplied post-fire changes affected the storyteller's family relationships.": return "Did those changes affect your family relationships?";
    case "Explore how the established post-fire period changed the storyteller's relationship with their father.": return "How did that period change your relationship with your father?";
    case "Learn what led the storyteller to call their father and begin the established reconciliation.": return "What led you to call your father?";
    case "Advance to the next major change in the storyteller's life after the resolved house-fire period.": return "What was the next big change in your life?";
    case "Invite the storyteller to say how the childhood smoking incident unfolded.": return "What happened with the smoking incident?";
    case "Determine whether getting caught changed the storyteller's smoking behavior afterward.": return "Did getting caught change what you did after that?";
    case "Move forward to the next meaningful part of the storyteller's childhood.": return "What came next in your childhood?";
    case "Determine whether this was the storyteller's first serious trouble with their parents.": return "Was that the first time you got into serious trouble with your parents?";
    case "Advance to the next meaningful part of the storyteller's youth.": return "What was the next important change in your youth?";
    case "Ask what happened when the storyteller passed the note in class.": return "What happened when you passed the note?";
    case "Return to the broader school-years story and invite the next meaningful experience from that period.": return "What other school experience mattered to you around then?";
    case "Determine whether the first-job mishap changed how the storyteller approached the job afterward.": return "Did that change how you approached the job?";
    case "Move forward to the next meaningful development in the storyteller's working life.": return "What came next in your working life?";
    case "Learn what winning the established championship game meant to the storyteller at the time.": return "What did winning that game mean to you then?";
    case "Move forward to what came next in the storyteller's life after that sports season.": return "What came next in your life after that season?";
    case "Establish how old the storyteller was when they began boxing.": return "How old were you when you started boxing?";
    case "Learn how the storyteller first got into boxing.": return "How did you first get into boxing?";
    case "Explore how the storyteller's brother got them started in boxing.": return "How did your brother get you started?";
    case "Ask what happened as the storyteller first began boxing, following only the supplied entry story.": return "What happened when you started boxing?";
    case "Invite the storyteller to identify a particular fight they still remember.": return "Any fights you still remember?";
    case "Invite the storyteller to continue what happened in the specific fight already introduced.": return "What happened in that fight?";
    case "Establish how old the storyteller was when they started their first job.": return "How old were you when you started that job?";
    case "Learn how the storyteller got their first job.": return "How did you get that job?";
    case "Learn what mattered most to the storyteller about their first job.": return "What mattered most to you about that first job?";
    case "Follow how the supplied person or event led to the storyteller getting the first job.": return "How did that lead to you getting the job?";
    case "Establish approximately how old the storyteller was at the time of the move.": return "About how old were you when you moved?";
    case "Learn what led to the established move without suggesting a reason.": return "What led to the move?";
    case "Ask what happened next as the established move unfolded.": return "What happened next with the move?";
    case "Establish how old the storyteller was when they joined the military.": return "How old were you when you joined?";
    case "Learn what led the storyteller to join the military.": return "What led you to join?";
    case "Ask what happened next as the storyteller entered military service.": return "What happened when you entered the service?";
    case "Establish approximately how old the storyteller was when they met their spouse.": return "About how old were you when you met?";
    case "Ask how the storyteller met their spouse.": return "How did you meet?";
    case "Invite the storyteller to continue what happened when they met their spouse.": return "What happened when you met?";
    case "Establish approximately how old the storyteller was when the childhood activity began.": return "About how old were you when you started?";
    case "Learn how the storyteller first got into the established childhood activity.": return "How did you first get into it?";
    case "Explore how the supplied person or action introduced the storyteller to the childhood activity.": return "How did that get started?";
    case "Ask what happened when the storyteller reached the destination.": return "What happened when you got there?";
    case "Invite the storyteller to describe how those family evenings usually unfolded.": return "How did those evenings usually unfold?";
    case "Move forward with one broad grounded life-story question without inventing a new subject.": return "What happened next in your life?";
    default: return "What came next for you after that?";
  }
}

export async function writeNextQuestion(args: TurnArgs, direction: InterviewDirectorResult): Promise<QuestionWriterResult> {
  if (providers.interview === "mock") {
    return { next_question: mockQuestion(direction), contains_unstated_personal_fact: false, assumption_explanation: "" };
  }
  const response = await openai.responses.create({
    model: config.openaiInterviewModel,
    store: false,
    reasoning: { effort: "low" },
    instructions: QUESTION_WRITER_INSTRUCTIONS,
    input: `${contextInput(args)}\n\nDIRECTOR_OUTPUT:\n${JSON.stringify(direction)}`,
    text: {
      verbosity: "low",
      format: { type: "json_schema", name: "interview_question", strict: true, schema: QUESTION_WRITER_SCHEMA },
    },
  });
  return JSON.parse(response.output_text) as QuestionWriterResult;
}

function appDecision(args: TurnArgs, direction: InterviewDirectorResult): InterviewDecision {
  const goBackQuestion = direction.command?.name === "go_back" ? args.storyHistory.at(-1)?.question : undefined;
  const { app_response: appResponse, ...diagnostics } = direction;
  return {
    ...diagnostics,
    intent: direction.interview_intent,
    next_question: goBackQuestion ?? args.currentQuestion,
    speak_text: appResponse,
    contains_unstated_personal_fact: false,
    assumption_explanation: "",
  };
}

function storyDecision(direction: InterviewDirectorResult, writer: QuestionWriterResult): InterviewDecision {
  const { app_response: _appResponse, ...diagnostics } = direction;
  const decision: InterviewDecision = {
    ...diagnostics,
    intent: direction.interview_intent,
    next_question: writer.next_question,
    speak_text: writer.next_question,
    contains_unstated_personal_fact: writer.contains_unstated_personal_fact,
    assumption_explanation: writer.assumption_explanation,
  };
  if (writer.contains_unstated_personal_fact) {
    decision.chronology_status = "partially_anchored";
    decision.current_topic = "the supplied life-story sequence";
    decision.story_is_emerging = false;
    decision.story_thread = "the next event in the supplied account";
    decision.director_note = "The drafted question was not fully grounded, so fail closed to a broad chronological continuation.";
    decision.question_objective = "Ask what happened next without introducing a new personal fact.";
    decision.followup_value = "low";
    decision.followup_reason = "The drafted follow-up was unsafe, so no event-specific continuation can be justified.";
    decision.story_resolution_status = "resolved";
    decision.story_importance = "minor";
    decision.current_thread_followup_count = 0;
    decision.followup_budget = 0;
    decision.followup_budget_remaining = 0;
    decision.should_advance = true;
    decision.context_opportunity = "none";
    decision.next_question = "What came next for you after that?";
    decision.speak_text = decision.next_question;
  }
  return decision;
}

export async function decideNextTurn(args: TurnArgs): Promise<InterviewDecision> {
  const direction = await directNextTurn(args);
  if (direction.interview_intent === "app_question" ||
      (direction.interview_intent === "app_command" && direction.command?.name !== "skip")) {
    return appDecision(args, direction);
  }
  const writer = await writeNextQuestion(args, direction);
  if (direction.interview_intent === "app_command") {
    return { ...storyDecision(direction, writer), speak_text: direction.app_response };
  }
  return storyDecision(direction, writer);
}
