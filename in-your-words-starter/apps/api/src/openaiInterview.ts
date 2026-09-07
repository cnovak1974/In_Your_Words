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

export type ChronologyStatus = typeof CHRONOLOGY_STATUSES[number];
export type ContextOpportunity = typeof CONTEXT_OPPORTUNITIES[number];
export type StoryHistoryTurn = {
  question: string;
  answer: string;
  chronologyStatus?: ChronologyStatus;
  currentLifePeriod?: string;
  currentTopic?: string;
  storyThread?: string;
  storyIsEmerging?: boolean;
};

type Intent = "story_answer" | "app_question" | "app_command";
type CommandName = "repeat_question" | "slower" | "faster" | "larger_text" | "smaller_text" |
  "high_contrast" | "normal_contrast" | "pause" | "skip" | "go_back";
type InterviewCommand = { name: CommandName; value: string | null };
type Entities = { people: string[]; places: string[]; dates: string[]; organizations: string[] };

export type InterviewDirectorResult = {
  interview_intent: Intent;
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
  should_advance: boolean;
  context_opportunity: ContextOpportunity;
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
  intent: Intent;
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
    app_response: { type: "string" },
    command: commandSchema,
    entities: entitiesSchema,
  },
  required: [
    "interview_intent", "director_note", "question_objective", "story_thread", "current_life_period",
    "current_topic", "story_is_emerging", "should_advance", "chronology_status", "approx_age_known",
    "approx_year_known", "place_known", "context_opportunity", "app_response", "command", "entities",
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
    should_advance: skipping,
    context_opportunity: "none",
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
    should_advance: true,
    context_opportunity: "none",
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

  const ageKnown = hasApproxAge(allText);
  const yearKnown = hasApproxYear(allText);

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
    const base = {
      approx_age_known: ageKnown,
      approx_year_known: yearKnown,
      place_known: /\b(?:at|in) [a-z]+(?: [a-z]+){0,2}\b/i.test(transcript),
      current_life_period: "the storyteller's entry into working life",
      current_topic: "first job",
      story_thread: "how the storyteller entered their first job and what happened there",
      should_advance: false,
    };
    if (/how did you get (?:that|your first) job/.test(question)) {
      return storyDirector({
        ...base,
        chronology_status: "anchored",
        story_is_emerging: true,
        director_note: "The way the first job began now contains an action or relationship. Follow how that led to the job rather than asking abstractly about work.",
        question_objective: "Follow how the supplied person or event led to the storyteller getting the first job.",
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
    case "Establish how old the storyteller was when they began boxing.": return "How old were you when you started boxing?";
    case "Learn how the storyteller first got into boxing.": return "How did you first get into boxing?";
    case "Explore how the storyteller's brother got them started in boxing.": return "How did your brother get you started?";
    case "Ask what happened as the storyteller first began boxing, following only the supplied entry story.": return "What happened when you started boxing?";
    case "Invite the storyteller to identify a particular fight they still remember.": return "Any fights you still remember?";
    case "Invite the storyteller to continue what happened in the specific fight already introduced.": return "What happened in that fight?";
    case "Establish how old the storyteller was when they started their first job.": return "How old were you when you started that job?";
    case "Learn how the storyteller got their first job.": return "How did you get that job?";
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
    default: return "What happened next?";
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
    decision.should_advance = true;
    decision.context_opportunity = "none";
    decision.next_question = "What happened next?";
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
