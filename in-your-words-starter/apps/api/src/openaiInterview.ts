import OpenAI from "openai";
import { config, providers } from "./config.js";
import { INTERVIEW_PLANNER_INSTRUCTIONS, QUESTION_WRITER_INSTRUCTIONS } from "./interviewPrompt.js";

const openai = new OpenAI({ apiKey: config.openaiApiKey });

export const QUESTION_STRATEGIES = [
  "deepen_scene",
  "continue_timeline",
  "relationship_context",
  "cause_and_effect",
  "clarify_fact",
  "sensory_recall",
  "significance",
  "compare_period",
  "transition_milestone",
] as const;

export const NARRATIVE_STATES = [
  "scene_open",
  "scene_developing",
  "scene_exhausted",
  "transition_open",
  "milestone_open",
  "timeline_gap",
] as const;

export const NEXT_MOVES = [
  "stay_in_scene",
  "advance_event",
  "advance_period",
  "explore_relationship",
  "explore_decision",
  "explore_consequence",
  "transition_milestone",
] as const;

export type QuestionStrategy = typeof QUESTION_STRATEGIES[number];
export type NarrativeState = typeof NARRATIVE_STATES[number];
export type NextMove = typeof NEXT_MOVES[number];
export type StoryHistoryTurn = { question: string; answer: string; strategy?: QuestionStrategy };

type Intent = "story_answer" | "app_question" | "app_command";
type CommandName = "repeat_question" | "slower" | "faster" | "larger_text" | "smaller_text" |
  "high_contrast" | "normal_contrast" | "pause" | "skip" | "go_back";
type InterviewCommand = { name: CommandName; value: string | null };
type Entities = { people: string[]; places: string[]; dates: string[]; organizations: string[] };

export type InterviewPlan = {
  intent: Intent;
  narrative_state: NarrativeState;
  story_position: string;
  unfinished_business: string | null;
  interview_goal: string;
  thread_to_follow: string;
  thread_is_incidental: boolean;
  should_advance: boolean;
  next_move: NextMove;
  strategy: QuestionStrategy;
  strategy_reason: string;
  question_objective: string;
  app_response: string;
  command: InterviewCommand | null;
  entities: Entities;
};

export type QuestionWriterResult = {
  next_question: string;
  contains_unstated_personal_fact: boolean;
  assumption_explanation: string;
};

export type InterviewDecision = Omit<InterviewPlan, "app_response"> & QuestionWriterResult & {
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
            "high_contrast", "normal_contrast", "pause", "skip", "go_back"
          ]
        },
        value: { anyOf: [{ type: "string" }, { type: "null" }] }
      },
      required: ["name", "value"]
    },
    { type: "null" }
  ]
};

const entitiesSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    people: { type: "array", items: { type: "string" } },
    places: { type: "array", items: { type: "string" } },
    dates: { type: "array", items: { type: "string" } },
    organizations: { type: "array", items: { type: "string" } }
  },
  required: ["people", "places", "dates", "organizations"]
};

export const INTERVIEW_PLANNER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: { type: "string", enum: ["story_answer", "app_question", "app_command"] },
    narrative_state: { type: "string", enum: NARRATIVE_STATES },
    story_position: { type: "string" },
    unfinished_business: { anyOf: [{ type: "string" }, { type: "null" }] },
    interview_goal: { type: "string" },
    thread_to_follow: { type: "string" },
    thread_is_incidental: { type: "boolean" },
    should_advance: { type: "boolean" },
    next_move: { type: "string", enum: NEXT_MOVES },
    strategy: { type: "string", enum: QUESTION_STRATEGIES },
    strategy_reason: { type: "string" },
    question_objective: { type: "string" },
    app_response: { type: "string" },
    command: commandSchema,
    entities: entitiesSchema,
  },
  required: [
    "intent", "narrative_state", "story_position", "unfinished_business", "interview_goal",
    "thread_to_follow", "thread_is_incidental", "should_advance", "next_move", "strategy",
    "strategy_reason", "question_objective", "app_response", "command", "entities",
  ]
};

export const QUESTION_WRITER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    next_question: { type: "string" },
    contains_unstated_personal_fact: { type: "boolean" },
    assumption_explanation: { type: "string" },
  },
  required: ["next_question", "contains_unstated_personal_fact", "assumption_explanation"]
};

type TurnArgs = {
  currentQuestion: string;
  transcript: string;
  storyHistory: StoryHistoryTurn[];
};

const emptyEntities = (): Entities => ({ people: [], places: [], dates: [], organizations: [] });

function contextInput(args: TurnArgs) {
  const history = args.storyHistory.slice(-12)
    .map((turn, index) => `TURN ${index + 1}\nSTRATEGY: ${turn.strategy ?? "unknown"}\nQ: ${turn.question}\nA: ${turn.answer}`)
    .join("\n\n");
  return `CURRENT_QUESTION:\n${args.currentQuestion}\n\nSTORY_HISTORY:\n${history || "(none yet)"}\n\nCURRENT_TRANSCRIPT:\n${args.transcript}`;
}

function appPlan(intent: "app_question" | "app_command", appResponse: string, command: InterviewCommand | null): InterviewPlan {
  return {
    intent,
    narrative_state: "scene_open",
    story_position: "the current interview question is interrupted by an app request",
    unfinished_business: "resume the current interview question",
    interview_goal: "resume the interrupted interview question",
    thread_to_follow: "the current interview question",
    thread_is_incidental: false,
    should_advance: command?.name === "skip",
    next_move: command?.name === "skip" ? "advance_period" : "stay_in_scene",
    strategy: command?.name === "skip" ? "continue_timeline" : "clarify_fact",
    strategy_reason: `This is an ${intent === "app_command" ? "app command" : "app question"}, so story handling remains unchanged.`,
    question_objective: command?.name === "skip" ? "Move to the next grounded point in the life story without introducing a new fact." : "Resume the current interview question exactly after handling the app request.",
    app_response: appResponse,
    command,
    entities: emptyEntities(),
  };
}

function storyPlan(overrides: Partial<InterviewPlan> = {}): InterviewPlan {
  return {
    intent: "story_answer",
    narrative_state: "timeline_gap",
    story_position: "continuing the supplied sequence of events",
    unfinished_business: null,
    interview_goal: "advance chronology",
    thread_to_follow: "the sequence of events in the storyteller's account",
    thread_is_incidental: false,
    should_advance: true,
    next_move: "advance_event",
    strategy: "continue_timeline",
    strategy_reason: "The supplied story can move forward chronologically without assuming new details.",
    question_objective: "Ask what happened next in the supplied sequence of events.",
    app_response: "",
    command: null,
    entities: emptyEntities(),
    ...overrides,
  };
}

function mockPlan(args: TurnArgs): InterviewPlan {
  const normalized = args.transcript.toLowerCase();
  const historyText = args.storyHistory.map((turn) => turn.answer).join(" ").toLowerCase();
  if (/^(please )?(repeat|talk slower|slow down|talk faster|pause|skip|go back)/.test(normalized)) {
    let name: CommandName = "repeat_question";
    if (normalized.includes("slow")) name = "slower";
    else if (normalized.includes("fast")) name = "faster";
    else if (normalized.includes("pause")) name = "pause";
    else if (normalized.includes("skip")) name = "skip";
    else if (normalized.includes("go back")) name = "go_back";
    return appPlan("app_command", "Okay.", { name, value: null });
  }
  const startsWhQuestion = /^(what|when|where|who|why|how)\b/.test(normalized) &&
    !/^(when|where|how) (i|we|my|our)\b/.test(normalized);
  if (normalized.endsWith("?") || startsWhQuestion) {
    return appPlan("app_question", "That information is not available in mock mode.", null);
  }

  const hasWalkHomeRoutine = /walked home from school/.test(normalized) || /walked home from school/.test(historyText);
  let plan: InterviewPlan;
  if (/\bdraft notice\b/.test(normalized)) {
    plan = storyPlan({
      narrative_state: "transition_open",
      story_position: "leaving a period of work after receiving a draft notice",
      unfinished_business: "what happened after the draft notice",
      interview_goal: "understand a transition",
      thread_to_follow: "the life transition triggered by the draft notice",
      should_advance: true,
      next_move: "transition_milestone",
      strategy: "transition_milestone",
      strategy_reason: "The draft notice changes the direction of the work period and opens a life transition.",
      question_objective: "Explore what happened after the storyteller received the draft notice.",
    });
  } else if (/\b(joined|enlisted in)\b.*\barmy\b/.test(normalized)) {
    plan = storyPlan({
      narrative_state: "transition_open",
      story_position: "moving from a period of work into the Army",
      unfinished_business: "what led into joining the Army",
      interview_goal: "understand a transition",
      thread_to_follow: "the transition from work into the Army",
      next_move: "explore_decision",
      strategy: "cause_and_effect",
      strategy_reason: "The account moves from work to joining the Army, creating a consequential transition.",
      question_objective: "Explore what led up to the storyteller joining the Army.",
    });
  } else if (/\bmoved to arizona\b/.test(normalized)) {
    plan = storyPlan({
      narrative_state: "transition_open",
      story_position: "entering a new period after moving to Arizona",
      unfinished_business: "how life changed after the move",
      interview_goal: "understand a transition",
      thread_to_follow: "the change in life after the move",
      next_move: "transition_milestone",
      strategy: "transition_milestone",
      strategy_reason: "The move establishes a life transition that can move the account forward.",
      question_objective: "Explore how life changed after the move.",
    });
  } else if (/\bdrove all night\b/.test(normalized)) {
    plan = storyPlan({
      story_position: "at the end of an overnight journey",
      unfinished_business: "what happened at the destination",
      thread_to_follow: "the overnight journey and what followed",
      thread_is_incidental: true,
      strategy_reason: "The completed journey opens the next event, while the vehicle description is incidental.",
      question_objective: "Advance to what happened when the storyteller reached the destination.",
    });
  } else if (/\b(cars? (going|passing) by|grocery store)\b/.test(normalized) && hasWalkHomeRoutine) {
    plan = storyPlan({
      narrative_state: "scene_exhausted",
      story_position: "describing a recurring childhood trip from school to home",
      unfinished_business: "what usually happened upon reaching home",
      thread_to_follow: "the daily transition from school to home",
      thread_is_incidental: true,
      strategy_reason: "The latest surroundings are incidental to the established daily journey, so the routine should advance to home.",
      question_objective: "Continue the established daily routine to what happened when the storyteller reached home.",
    });
  } else if (/\b(mother|mom)\b.*\b(making|cooking) dinner\b/.test(normalized) && hasWalkHomeRoutine) {
    plan = storyPlan({
      narrative_state: "scene_developing",
      story_position: "describing the recurring family routine after arriving home from school",
      unfinished_business: null,
      interview_goal: "understand an established relationship",
      thread_to_follow: "the family pattern at home after school",
      should_advance: false,
      next_move: "explore_relationship",
      strategy: "relationship_context",
      strategy_reason: "The account has reached a recurring family pattern at home that can be explored without centering dinner.",
      question_objective: "Explore the established family pattern at home after school at a meaningful level.",
    });
  } else if (/\bwalked home from school every day\b/.test(normalized)) {
    plan = storyPlan({
      narrative_state: "scene_open",
      story_position: "describing a recurring childhood walk home from school",
      interview_goal: "understand a recurring childhood routine",
      thread_to_follow: "the daily routine between school and home",
      should_advance: false,
      next_move: "stay_in_scene",
      strategy: "deepen_scene",
      strategy_reason: "The storyteller has opened a recurring childhood routine that has not yet been developed.",
      question_objective: "Explore the established daily routine between school and home at a meaningful level.",
    });
  } else if (/\b(mom|mother)\b/.test(normalized) && /\b(dad|father)\b/.test(normalized)) {
    plan = storyPlan({
      narrative_state: "scene_developing",
      story_position: "inside an established family scene",
      interview_goal: "understand an established relationship",
      thread_to_follow: "family life around that time",
      should_advance: false,
      next_move: "explore_relationship",
      strategy: "deepen_scene",
      strategy_reason: "The answer establishes a family pattern that can be explored without centering incidental scene details.",
      question_objective: "Explore what family life was generally like around that time.",
    });
  } else {
    plan = storyPlan();
  }

  const detailStrategies: QuestionStrategy[] = ["deepen_scene", "relationship_context", "clarify_fact", "sensory_recall"];
  const lastTwo = args.storyHistory.slice(-2);
  const twoDetailQuestions = lastTwo.length === 2 && lastTwo.every((turn) => turn.strategy && detailStrategies.includes(turn.strategy));
  if (twoDetailQuestions && !plan.should_advance) {
    return storyPlan({
      narrative_state: "scene_exhausted",
      story_position: plan.story_position,
      unfinished_business: null,
      thread_to_follow: "what followed the established scene",
      strategy_reason: "Two consecutive detail questions stayed in the same scene, so the interview should now move forward.",
      question_objective: "Advance to what happened next in that period of the storyteller's life.",
    });
  }
  return plan;
}

export async function planNextTurn(args: TurnArgs): Promise<InterviewPlan> {
  if (providers.interview === "mock") return mockPlan(args);
  const response = await openai.responses.create({
    model: config.openaiInterviewModel,
    store: false,
    reasoning: { effort: "low" },
    instructions: INTERVIEW_PLANNER_INSTRUCTIONS,
    input: contextInput(args),
    text: {
      verbosity: "low",
      format: { type: "json_schema", name: "interview_plan", strict: true, schema: INTERVIEW_PLANNER_SCHEMA },
    },
  });
  return JSON.parse(response.output_text) as InterviewPlan;
}

function mockQuestion(plan: InterviewPlan): string {
  switch (plan.question_objective) {
    case "Explore what happened after the storyteller received the draft notice.": return "What happened after you received the draft notice?";
    case "Explore what led up to the storyteller joining the Army.": return "What led up to joining the Army?";
    case "Explore how life changed after the move.": return "How did life change after the move?";
    case "Advance to what happened when the storyteller reached the destination.": return "What happened when you got where you were going?";
    case "Continue the established daily routine to what happened when the storyteller reached home.": return "What usually happened when you got home?";
    case "Explore the established family pattern at home after school at a meaningful level.": return "What was that time at home usually like for your family?";
    case "Explore the established daily routine between school and home at a meaningful level.": return "What was that daily routine between school and home like for you?";
    case "Explore what family life was generally like around that time.": return "What were evenings like for your family around that time?";
    case "Advance to what happened next in that period of the storyteller's life.": return "What happened next in that period of your life?";
    default:
      if (plan.next_move === "explore_relationship") return "How would you describe that relationship at that time?";
      if (plan.next_move === "explore_decision") return "What led up to that decision?";
      if (plan.next_move === "explore_consequence") return "What changed after that?";
      if (plan.next_move === "stay_in_scene") return "What happened as that scene unfolded?";
      return "What happened next?";
  }
}

export async function writeNextQuestion(args: TurnArgs, plan: InterviewPlan): Promise<QuestionWriterResult> {
  if (providers.interview === "mock") {
    return { next_question: mockQuestion(plan), contains_unstated_personal_fact: false, assumption_explanation: "" };
  }
  const response = await openai.responses.create({
    model: config.openaiInterviewModel,
    store: false,
    reasoning: { effort: "low" },
    instructions: QUESTION_WRITER_INSTRUCTIONS,
    input: `${contextInput(args)}\n\nPLANNER_OUTPUT:\n${JSON.stringify(plan)}`,
    text: {
      verbosity: "low",
      format: { type: "json_schema", name: "interview_question", strict: true, schema: QUESTION_WRITER_SCHEMA },
    },
  });
  return JSON.parse(response.output_text) as QuestionWriterResult;
}

function appDecision(args: TurnArgs, plan: InterviewPlan): InterviewDecision {
  const goBackQuestion = plan.command?.name === "go_back" ? args.storyHistory.at(-1)?.question : undefined;
  const { app_response: appResponse, ...diagnostics } = plan;
  return {
    ...diagnostics,
    next_question: goBackQuestion ?? args.currentQuestion,
    speak_text: appResponse,
    contains_unstated_personal_fact: false,
    assumption_explanation: "",
  };
}

function storyDecision(plan: InterviewPlan, writer: QuestionWriterResult): InterviewDecision {
  const { app_response: _appResponse, ...diagnostics } = plan;
  const decision: InterviewDecision = {
    ...diagnostics,
    next_question: writer.next_question,
    speak_text: writer.next_question,
    contains_unstated_personal_fact: writer.contains_unstated_personal_fact,
    assumption_explanation: writer.assumption_explanation,
  };
  if (writer.contains_unstated_personal_fact) {
    decision.narrative_state = "timeline_gap";
    decision.interview_goal = "advance chronology without adding facts";
    decision.thread_to_follow = "the next event in the supplied account";
    decision.thread_is_incidental = false;
    decision.should_advance = true;
    decision.next_move = "advance_event";
    decision.strategy = "continue_timeline";
    decision.strategy_reason = "A broad chronological continuation is safest because supplied content does not ground the drafted question.";
    decision.question_objective = "Ask what happened next without introducing a new personal fact.";
    decision.next_question = "What happened next?";
    decision.speak_text = decision.next_question;
  }
  return decision;
}

export async function decideNextTurn(args: TurnArgs): Promise<InterviewDecision> {
  const plan = await planNextTurn(args);
  if (plan.intent === "app_question" || (plan.intent === "app_command" && plan.command?.name !== "skip")) {
    return appDecision(args, plan);
  }
  const writer = await writeNextQuestion(args, plan);
  if (plan.intent === "app_command") {
    return { ...storyDecision(plan, writer), speak_text: plan.app_response };
  }
  return storyDecision(plan, writer);
}

