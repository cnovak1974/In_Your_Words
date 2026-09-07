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

export const LIFE_STAGES = [
  "origins",
  "childhood",
  "school_years",
  "adolescence",
  "early_adulthood",
  "military",
  "work_career",
  "relationships_family",
  "middle_life",
  "later_life",
  "reflection_legacy",
] as const;

export const TOPIC_TYPES = [
  "activity",
  "sport",
  "job",
  "school",
  "relationship",
  "move",
  "military_service",
  "major_event",
  "family_routine",
  "hobby",
  "health_event",
  "other",
] as const;

export type QuestionStrategy = typeof QUESTION_STRATEGIES[number];
export type NarrativeState = typeof NARRATIVE_STATES[number];
export type NextMove = typeof NEXT_MOVES[number];
export type LifeStage = typeof LIFE_STAGES[number];
export type TopicType = typeof TOPIC_TYPES[number];
export type StoryHistoryTurn = {
  question: string;
  answer: string;
  strategy?: QuestionStrategy;
  lifeStage?: LifeStage;
  currentTopic?: string;
  nextTopicBeat?: string | null;
  topicComplete?: boolean;
  returnToLifeRoadmap?: boolean;
};

type Intent = "story_answer" | "app_question" | "app_command";
type CommandName = "repeat_question" | "slower" | "faster" | "larger_text" | "smaller_text" |
  "high_contrast" | "normal_contrast" | "pause" | "skip" | "go_back";
type InterviewCommand = { name: CommandName; value: string | null };
type Entities = { people: string[]; places: string[]; dates: string[]; organizations: string[] };

export type InterviewPlan = {
  intent: Intent;
  narrative_state: NarrativeState;
  life_stage: LifeStage;
  life_stage_goal: string;
  story_position: string;
  current_topic: string;
  topic_type: TopicType;
  topic_beats_remaining: string[];
  topic_is_rich: boolean;
  topic_complete: boolean;
  next_topic_beat: string | null;
  return_to_life_roadmap: boolean;
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
    life_stage: { type: "string", enum: LIFE_STAGES },
    life_stage_goal: { type: "string" },
    story_position: { type: "string" },
    current_topic: { type: "string" },
    topic_type: { type: "string", enum: TOPIC_TYPES },
    topic_beats_remaining: { type: "array", items: { type: "string" } },
    topic_is_rich: { type: "boolean" },
    topic_complete: { type: "boolean" },
    next_topic_beat: { anyOf: [{ type: "string" }, { type: "null" }] },
    return_to_life_roadmap: { type: "boolean" },
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
    "intent", "narrative_state", "life_stage", "life_stage_goal", "story_position",
    "current_topic", "topic_type", "topic_beats_remaining", "topic_is_rich", "topic_complete",
    "next_topic_beat", "return_to_life_roadmap", "unfinished_business", "interview_goal",
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
    .map((turn, index) => [
      `TURN ${index + 1}`,
      `LIFE_STAGE: ${turn.lifeStage ?? "unknown"}`,
      `TOPIC: ${turn.currentTopic ?? "unknown"}`,
      `NEXT_TOPIC_BEAT: ${turn.nextTopicBeat ?? "none"}`,
      `TOPIC_COMPLETE: ${turn.topicComplete ?? "unknown"}`,
      `RETURN_TO_LIFE_ROADMAP: ${turn.returnToLifeRoadmap ?? "unknown"}`,
      `STRATEGY: ${turn.strategy ?? "unknown"}`,
      `Q: ${turn.question}`,
      `A: ${turn.answer}`,
    ].join("\n"))
    .join("\n\n");
  return `CURRENT_QUESTION:\n${args.currentQuestion}\n\nSTORY_HISTORY:\n${history || "(none yet)"}\n\nCURRENT_TRANSCRIPT:\n${args.transcript}`;
}

function appPlan(intent: "app_question" | "app_command", appResponse: string, command: InterviewCommand | null): InterviewPlan {
  return {
    intent,
    narrative_state: "scene_open",
    life_stage: "origins",
    life_stage_goal: "resume the interrupted interview without changing the life-story roadmap",
    story_position: "the current interview question is interrupted by an app request",
    current_topic: "the interrupted interview topic",
    topic_type: "other",
    topic_beats_remaining: [],
    topic_is_rich: false,
    topic_complete: false,
    next_topic_beat: null,
    return_to_life_roadmap: false,
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
    life_stage: "origins",
    life_stage_goal: "establish the beginning of the storyteller's life account",
    story_position: "continuing the supplied sequence of events",
    current_topic: "the storyteller's early life",
    topic_type: "other",
    topic_beats_remaining: [],
    topic_is_rich: false,
    topic_complete: true,
    next_topic_beat: null,
    return_to_life_roadmap: true,
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
  const currentQuestion = args.currentQuestion.toLowerCase();
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

  const openingPlan = (nextBeat: string, remaining: string[], objective: string): InterviewPlan => storyPlan({
    narrative_state: "scene_developing",
    life_stage: "childhood",
    life_stage_goal: "establish the storyteller's childhood setting, family life, interests, everyday patterns, and transition toward adolescence",
    story_position: "building the opening childhood portion of the life story",
    current_topic: "the childhood opening arc",
    topic_type: "other",
    topic_beats_remaining: remaining,
    topic_is_rich: true,
    topic_complete: false,
    next_topic_beat: nextBeat,
    return_to_life_roadmap: false,
    unfinished_business: null,
    interview_goal: `develop the ${nextBeat} beat of the childhood opening`,
    thread_to_follow: "the storyteller's broader childhood experience",
    should_advance: true,
    next_move: "advance_period",
    strategy: nextBeat === "family life" ? "relationship_context" : "continue_timeline",
    strategy_reason: `The stable childhood opening arc is ready to progress to ${nextBeat}.`,
    question_objective: objective,
  });

  const priorTurn = args.storyHistory.at(-1);
  const priorTopicIsOpen = priorTurn?.topicComplete !== true && priorTurn?.returnToLifeRoadmap !== true;
  const boxingIsCurrent = /\bbox(?:ed|ing)?\b/.test(`${normalized} ${currentQuestion}`) ||
    (priorTopicIsOpen && priorTurn?.currentTopic === "boxing");
  if (boxingIsCurrent) {
    const boxingBase = {
      life_stage: "adolescence" as LifeStage,
      life_stage_goal: "understand the storyteller's activities and how they led into the next period",
      story_position: "developing boxing as a meaningful activity in the storyteller's younger years",
      current_topic: "boxing",
      topic_type: "sport" as TopicType,
      topic_is_rich: true,
      topic_complete: false,
      return_to_life_roadmap: false,
      thread_to_follow: "the storyteller's participation in boxing over time",
      thread_is_incidental: false,
      should_advance: true,
      next_move: "advance_event" as NextMove,
      strategy: "continue_timeline" as QuestionStrategy,
    };
    if (/what came next.*boxing|after boxing/.test(currentQuestion)) {
      return storyPlan({
        ...boxingBase,
        narrative_state: "scene_exhausted",
        story_position: "at the close of the storyteller's boxing period",
        topic_beats_remaining: [],
        topic_complete: true,
        next_topic_beat: null,
        return_to_life_roadmap: true,
        interview_goal: "return to the broader life-stage roadmap",
        thread_to_follow: "the period that followed boxing",
        next_move: "advance_period",
        strategy_reason: "The boxing mini-arc has reached what followed it and can return to the broader roadmap.",
        question_objective: "Return to the broader life-stage roadmap and explore the next period without assuming what it contained.",
      });
    }
    if (/what happened with boxing after|how did.*boxing.*end|when did.*stop boxing/.test(currentQuestion)) {
      return storyPlan({
        ...boxingBase,
        narrative_state: "transition_open",
        topic_beats_remaining: ["what came next"],
        next_topic_beat: "what came next",
        interview_goal: "complete the boxing mini-arc by advancing beyond it",
        next_move: "advance_period",
        strategy: "transition_milestone",
        strategy_reason: "The storyteller has established the end of boxing, so the distinct remaining beat is what followed.",
        question_objective: "Ask what came next in the storyteller's life after boxing.",
      });
    }
    if (/fight.*stand out|standout.*fight/.test(currentQuestion)) {
      return storyPlan({
        ...boxingBase,
        narrative_state: "scene_developing",
        topic_beats_remaining: ["why or when it ended", "what came next"],
        next_topic_beat: "why or when it ended",
        interview_goal: "understand how the established boxing period progressed toward its end",
        strategy_reason: "Duration and a standout fight have been covered, leaving the distinct ending beat next.",
        question_objective: "Ask neutrally what happened with boxing after the standout fight, without assuming why it ended.",
      });
    }
    if (/how long.*box/.test(currentQuestion)) {
      return storyPlan({
        ...boxingBase,
        narrative_state: "scene_developing",
        topic_beats_remaining: ["standout events", "why or when it ended", "what came next"],
        next_topic_beat: "standout events",
        interview_goal: "recover a distinct event from the established boxing period",
        strategy: "deepen_scene",
        strategy_reason: "The duration beat is answered, so a standout event can deepen the meaningful boxing topic without repetition.",
        question_objective: "Invite the storyteller to describe whether any boxing match stands out, without suggesting an event.",
      });
    }
    return storyPlan({
      ...boxingBase,
      narrative_state: "scene_open",
      topic_beats_remaining: ["duration", "standout events", "why or when it ended", "what came next"],
      next_topic_beat: "duration",
      interview_goal: "establish the duration of the storyteller's boxing involvement",
      strategy: "clarify_fact",
      strategy_reason: "Boxing is an established meaningful activity, and duration is the next distinct unanswered beat.",
      question_objective: "Ask how long the storyteller boxed.",
    });
  }

  const moveContextIsActive = /\b(move|moving|moved|arriv|leav|departure|first impression)\b/.test(currentQuestion) ||
    (priorTopicIsOpen && priorTurn?.currentTopic === "the established move");
  const jobIsCurrent = (/\b(job|worked|work at|work for)\b/.test(`${normalized} ${currentQuestion}`) ||
    (priorTopicIsOpen && priorTurn?.currentTopic === "the established job")) &&
    !moveContextIsActive && !/\barmy\b|\bdraft notice\b/.test(normalized);
  if (jobIsCurrent) {
    const jobBase = {
      life_stage: "work_career" as LifeStage,
      life_stage_goal: "understand the storyteller's working life and its transitions",
      story_position: "developing an established job in the storyteller's working life",
      current_topic: "the established job",
      topic_type: "job" as TopicType,
      topic_is_rich: true,
      topic_complete: false,
      return_to_life_roadmap: false,
      thread_to_follow: "the storyteller's experience of the established job over time",
      thread_is_incidental: false,
      should_advance: true,
      next_move: "advance_event" as NextMove,
      strategy: "continue_timeline" as QuestionStrategy,
    };
    if (/what came next.*job|after.*job/.test(currentQuestion)) {
      return storyPlan({
        ...jobBase,
        narrative_state: "scene_exhausted",
        topic_beats_remaining: [],
        topic_complete: true,
        next_topic_beat: null,
        return_to_life_roadmap: true,
        interview_goal: "return to the broader work and life roadmap",
        thread_to_follow: "the period that followed the established job",
        next_move: "advance_period",
        strategy_reason: "The job mini-arc has reached what followed it and is complete.",
        question_objective: "Return to the broader life roadmap and explore the next period without assuming its content.",
      });
    }
    if (/job.*come to an end|job.*end/.test(currentQuestion)) {
      return storyPlan({
        ...jobBase,
        narrative_state: "transition_open",
        topic_beats_remaining: ["what came next"],
        next_topic_beat: "what came next",
        interview_goal: "complete the job mini-arc by advancing beyond it",
        next_move: "advance_period",
        strategy: "transition_milestone",
        strategy_reason: "The job's ending is established, leaving what followed as the next distinct beat.",
        question_objective: "Ask what came next for the storyteller after the job ended.",
      });
    }
    if (/event.*stand out|memorable.*job/.test(currentQuestion)) {
      return storyPlan({
        ...jobBase,
        narrative_state: "scene_developing",
        topic_beats_remaining: ["why it ended", "what came next"],
        next_topic_beat: "why it ended",
        interview_goal: "understand how the established job came to an end",
        strategy: "cause_and_effect",
        strategy_reason: "The job's events have been explored and supplied content establishes that the job later ended.",
        question_objective: "Ask how the established job came to an end without suggesting a reason.",
      });
    }
    if (/who.*matter|people.*job/.test(currentQuestion)) {
      return storyPlan({
        ...jobBase,
        narrative_state: "scene_developing",
        topic_beats_remaining: ["memorable events", "why it ended", "what came next"],
        next_topic_beat: "memorable events",
        interview_goal: "recover a meaningful event from the established job",
        strategy: "deepen_scene",
        strategy_reason: "The people beat is covered, so a distinct memorable-event beat can deepen the job narrative.",
        question_objective: "Invite the storyteller to describe whether any event from that job stands out.",
      });
    }
    if (/daily life|typical day|ordinary day/.test(currentQuestion)) {
      return storyPlan({
        ...jobBase,
        narrative_state: "scene_developing",
        topic_beats_remaining: ["people who mattered", "memorable events", "why it ended", "what came next"],
        next_topic_beat: "people who mattered",
        interview_goal: "understand established working relationships",
        next_move: "explore_relationship",
        strategy: "relationship_context",
        strategy_reason: "Daily work is covered, so the next distinct beat is the people who mattered there.",
        question_objective: "Ask who mattered to the storyteller during that established job and invite their own description.",
      });
    }
    if (/what did you do.*job|work involve/.test(currentQuestion)) {
      return storyPlan({
        ...jobBase,
        narrative_state: "scene_developing",
        topic_beats_remaining: ["daily life", "people who mattered", "memorable events", "why it ended", "what came next"],
        next_topic_beat: "daily life",
        interview_goal: "understand the everyday pattern of the established job",
        strategy: "deepen_scene",
        strategy_reason: "The storyteller has described the work itself, so daily life is the next distinct beat.",
        question_objective: "Ask what an ordinary day in the established job was like.",
      });
    }
    if (/how did you get.*job/.test(currentQuestion)) {
      return storyPlan({
        ...jobBase,
        narrative_state: "scene_developing",
        topic_beats_remaining: ["what they did", "daily life", "people who mattered", "memorable events", "why it ended", "what came next"],
        next_topic_beat: "what they did",
        interview_goal: "understand the storyteller's work in the established job",
        strategy: "deepen_scene",
        strategy_reason: "How the storyteller got the job is covered, so the actual work is the next distinct beat.",
        question_objective: "Ask what the storyteller did in the established job.",
      });
    }
    return storyPlan({
      ...jobBase,
      narrative_state: "scene_open",
      topic_beats_remaining: ["how they got it", "what they did", "daily life", "people who mattered", "memorable events", "why it ended", "what came next"],
      next_topic_beat: "how they got it",
      interview_goal: "understand how the storyteller entered the established job",
      strategy: "cause_and_effect",
      strategy_reason: "The job is established as a meaningful topic, and how it began is the first unanswered beat.",
      question_objective: "Ask how the storyteller got the established job.",
    });
  }

  const moveIsCurrent = /\b(move|moving|moved|arriv|leav|departure|first impression)\b/.test(`${normalized} ${currentQuestion}`) ||
    (priorTopicIsOpen && priorTurn?.currentTopic === "the established move");
  if (moveIsCurrent && !/moved to arizona/.test(normalized)) {
    const moveBase = {
      narrative_state: "transition_open" as NarrativeState,
      life_stage: "early_adulthood" as LifeStage,
      life_stage_goal: "understand the established move and the period it opened",
      story_position: "moving between established places in the storyteller's life",
      current_topic: "the established move",
      topic_type: "move" as TopicType,
      topic_is_rich: true,
      topic_complete: false,
      return_to_life_roadmap: false,
      thread_to_follow: "the established move as a life transition",
      thread_is_incidental: false,
      should_advance: true,
      next_move: "transition_milestone" as NextMove,
      strategy: "transition_milestone" as QuestionStrategy,
    };
    if (/what changed.*move|change after.*move/.test(currentQuestion)) {
      return storyPlan({
        ...moveBase,
        narrative_state: "scene_exhausted",
        topic_beats_remaining: [],
        topic_complete: true,
        next_topic_beat: null,
        return_to_life_roadmap: true,
        interview_goal: "return to the broader life-stage roadmap",
        thread_to_follow: "the period that followed the completed move",
        next_move: "advance_period",
        strategy: "continue_timeline",
        strategy_reason: "The move mini-arc has covered its consequences and can return to the broader roadmap.",
        question_objective: "Return to the broader life-stage roadmap by asking what period came next.",
      });
    }
    if (/first impression/.test(currentQuestion)) {
      return storyPlan({
        ...moveBase,
        topic_beats_remaining: ["what changed afterward"],
        next_topic_beat: "what changed afterward",
        interview_goal: "understand the consequences of the established move",
        next_move: "explore_consequence",
        strategy: "cause_and_effect",
        strategy_reason: "Arrival and first impressions are covered, leaving what changed afterward as the final move beat.",
        question_objective: "Ask what changed in the storyteller's life after the established move.",
      });
    }
    if (/what happened when you arrived|arrival/.test(currentQuestion)) {
      return storyPlan({
        ...moveBase,
        topic_beats_remaining: ["first impressions", "what changed afterward"],
        next_topic_beat: "first impressions",
        interview_goal: "understand the storyteller's own first impression after arriving",
        strategy: "deepen_scene",
        strategy_reason: "The arrival is covered, so the storyteller's unsuggested first impression is the next distinct beat.",
        question_objective: "Invite the storyteller's first impressions after arriving, without suggesting what they noticed or felt.",
      });
    }
    if (/leav|departure/.test(currentQuestion)) {
      return storyPlan({
        ...moveBase,
        topic_beats_remaining: ["arrival", "first impressions", "what changed afterward"],
        next_topic_beat: "arrival",
        interview_goal: "continue the move through arrival",
        strategy: "continue_timeline",
        strategy_reason: "The departure is covered, so arrival is the next chronological beat.",
        question_objective: "Ask what happened when the storyteller arrived after the established move.",
      });
    }
    if (/led up to.*move/.test(currentQuestion)) {
      return storyPlan({
        ...moveBase,
        topic_beats_remaining: ["departure", "arrival", "first impressions", "what changed afterward"],
        next_topic_beat: "departure",
        interview_goal: "continue the established move into departure",
        strategy: "continue_timeline",
        strategy_reason: "What led up to the move is covered, so departure is the next chronological beat.",
        question_objective: "Ask what the storyteller recalls about leaving for the established move without suggesting details.",
      });
    }
    return storyPlan({
      ...moveBase,
      topic_beats_remaining: ["what led up to it", "departure", "arrival", "first impressions", "what changed afterward"],
      next_topic_beat: "what led up to it",
      interview_goal: "understand what led up to the established move",
      next_move: "explore_decision",
      strategy: "cause_and_effect",
      strategy_reason: "The move opens a meaningful transition whose lead-up has not yet been explored.",
      question_objective: "Ask what led up to the established move without assuming a reason.",
    });
  }

  if (args.storyHistory.length === 0 && /early years|where did you grow up|home when you were young/.test(currentQuestion)) {
    return openingPlan("family life", ["family life", "childhood interests", "everyday life", "change with age"], "Ask what family life was like during the storyteller's childhood.");
  }
  if (/family life.*like/.test(currentQuestion)) {
    return openingPlan("childhood interests", ["childhood interests", "everyday life", "change with age"], "Ask what kinds of things the storyteller was interested in as a child.");
  }
  if (/things.*into.*kid|interested in.*child/.test(currentQuestion)) {
    return openingPlan("everyday life", ["everyday life", "change with age"], "Ask what everyday life was generally like during that childhood period.");
  }
  if (/everyday life|typical day/.test(currentQuestion)) {
    return openingPlan("change with age", ["change with age"], "Ask what changed as the storyteller got older, without suggesting a particular change.");
  }

  const hasWalkHomeRoutine = /walked home from school/.test(normalized) || /walked home from school/.test(historyText);
  let plan: InterviewPlan;
  if (/\bdraft notice\b/.test(normalized)) {
    plan = storyPlan({
      narrative_state: "transition_open",
      life_stage: "early_adulthood",
      life_stage_goal: "understand the transition opened by the draft notice",
      story_position: "leaving a period of work after receiving a draft notice",
      current_topic: "the transition opened by the draft notice",
      topic_type: "military_service",
      topic_beats_remaining: ["what happened next", "entry into service", "daily service life", "what came after service"],
      topic_is_rich: true,
      topic_complete: false,
      next_topic_beat: "what happened next",
      return_to_life_roadmap: false,
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
      life_stage: "military",
      life_stage_goal: "understand the storyteller's transition into and experience of military service",
      story_position: "moving from a period of work into the Army",
      current_topic: "the transition into the Army",
      topic_type: "military_service",
      topic_beats_remaining: ["entry or decision", "training or arrival", "duties and daily life", "relationships", "meaningful events", "transition out", "what came next"],
      topic_is_rich: true,
      topic_complete: false,
      next_topic_beat: "entry or decision",
      return_to_life_roadmap: false,
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
      life_stage: "childhood",
      life_stage_goal: "understand how the childhood move changed the storyteller's life",
      story_position: "entering a new period after moving to Arizona",
      current_topic: "the move to Arizona",
      topic_type: "move",
      topic_beats_remaining: ["what changed afterward"],
      topic_is_rich: true,
      topic_complete: false,
      next_topic_beat: "what changed afterward",
      return_to_life_roadmap: false,
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
      life_stage: "early_adulthood",
      life_stage_goal: "continue the established period beyond the completed journey",
      story_position: "at the end of an overnight journey",
      current_topic: "the overnight journey",
      topic_type: "major_event",
      topic_beats_remaining: ["what happened at the destination"],
      topic_is_rich: true,
      topic_complete: false,
      next_topic_beat: "what happened at the destination",
      return_to_life_roadmap: false,
      unfinished_business: "what happened at the destination",
      thread_to_follow: "the overnight journey and what followed",
      thread_is_incidental: true,
      strategy_reason: "The completed journey opens the next event, while the vehicle description is incidental.",
      question_objective: "Advance to what happened when the storyteller reached the destination.",
    });
  } else if (/\b(cars? (going|passing) by|grocery store)\b/.test(normalized) && hasWalkHomeRoutine) {
    plan = storyPlan({
      narrative_state: "scene_exhausted",
      life_stage: "school_years",
      life_stage_goal: "understand the storyteller's childhood routine between school and home",
      story_position: "describing a recurring childhood trip from school to home",
      current_topic: "the routine from school to home",
      topic_type: "family_routine",
      topic_beats_remaining: ["what happened upon reaching home"],
      topic_is_rich: true,
      topic_complete: false,
      next_topic_beat: "what happened upon reaching home",
      return_to_life_roadmap: false,
      unfinished_business: "what usually happened upon reaching home",
      thread_to_follow: "the daily transition from school to home",
      thread_is_incidental: true,
      strategy_reason: "The latest surroundings are incidental to the established daily journey, so the routine should advance to home.",
      question_objective: "Continue the established daily routine to what happened when the storyteller reached home.",
    });
  } else if (/\b(mother|mom)\b.*\b(making|cooking) dinner\b/.test(normalized) && hasWalkHomeRoutine) {
    plan = storyPlan({
      narrative_state: "scene_developing",
      life_stage: "school_years",
      life_stage_goal: "understand the storyteller's recurring childhood home and family pattern",
      story_position: "describing the recurring family routine after arriving home from school",
      current_topic: "the after-school family routine",
      topic_type: "family_routine",
      topic_beats_remaining: ["shared family pattern", "change over time", "what came next"],
      topic_is_rich: true,
      topic_complete: false,
      next_topic_beat: "shared family pattern",
      return_to_life_roadmap: false,
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
      life_stage: "school_years",
      life_stage_goal: "understand the storyteller's recurring childhood routine between school and home",
      story_position: "describing a recurring childhood walk home from school",
      current_topic: "the routine from school to home",
      topic_type: "family_routine",
      topic_beats_remaining: ["the routine's progression", "what happened upon reaching home", "family pattern at home"],
      topic_is_rich: true,
      topic_complete: false,
      next_topic_beat: "the routine's progression",
      return_to_life_roadmap: false,
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
      life_stage: "childhood",
      life_stage_goal: "understand the storyteller's family life during childhood",
      story_position: "inside an established family scene",
      current_topic: "childhood family life",
      topic_type: "family_routine",
      topic_beats_remaining: ["shared family pattern", "change over time", "what came next"],
      topic_is_rich: true,
      topic_complete: false,
      next_topic_beat: "shared family pattern",
      return_to_life_roadmap: false,
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
    return {
      ...plan,
      narrative_state: "scene_exhausted",
      story_position: plan.story_position,
      unfinished_business: null,
      topic_beats_remaining: [],
      topic_complete: true,
      next_topic_beat: null,
      return_to_life_roadmap: true,
      thread_to_follow: "what followed the established scene",
      should_advance: true,
      next_move: "advance_event",
      strategy: "continue_timeline",
      strategy_reason: "Two consecutive detail questions stayed in the same scene, so the interview should now move forward.",
      question_objective: "Advance to what happened next in that period of the storyteller's life.",
    };
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
    case "Ask what family life was like during the storyteller's childhood.": return "What was family life like for you then?";
    case "Ask what kinds of things the storyteller was interested in as a child.": return "What kinds of things were you into as a kid?";
    case "Ask what everyday life was generally like during that childhood period.": return "What did everyday life look like for you then?";
    case "Ask what changed as the storyteller got older, without suggesting a particular change.": return "What changed as you got older?";
    case "Ask how long the storyteller boxed.": return "How long did you box?";
    case "Invite the storyteller to describe whether any boxing match stands out, without suggesting an event.": return "Were there any fights that stand out to you?";
    case "Ask neutrally what happened with boxing after the standout fight, without assuming why it ended.": return "What happened with boxing after that fight?";
    case "Ask what came next in the storyteller's life after boxing.": return "What came next in your life after boxing?";
    case "Return to the broader life-stage roadmap and explore the next period without assuming what it contained.": return "What was the next period of your life like?";
    case "Ask how the storyteller got the established job.": return "How did you get that job?";
    case "Ask what the storyteller did in the established job.": return "What did you do in that job?";
    case "Ask what an ordinary day in the established job was like.": return "What was an ordinary day in that job like?";
    case "Ask who mattered to the storyteller during that established job and invite their own description.": return "Who mattered to you during that job?";
    case "Invite the storyteller to describe whether any event from that job stands out.": return "Were there any events from that job that stand out to you?";
    case "Ask how the established job came to an end without suggesting a reason.": return "How did that job come to an end?";
    case "Ask what came next for the storyteller after the job ended.": return "What came next for you after that job?";
    case "Return to the broader life roadmap and explore the next period without assuming its content.": return "What was the next period of your life like?";
    case "Ask what led up to the established move without assuming a reason.": return "What led up to that move?";
    case "Ask what the storyteller recalls about leaving for the established move without suggesting details.": return "What was leaving for that move like?";
    case "Ask what happened when the storyteller arrived after the established move.": return "What happened when you arrived?";
    case "Invite the storyteller's first impressions after arriving, without suggesting what they noticed or felt.": return "What were your first impressions after you arrived?";
    case "Ask what changed in the storyteller's life after the established move.": return "What changed for you after the move?";
    case "Return to the broader life-stage roadmap by asking what period came next.": return "What period of your life came next?";
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
    decision.life_stage_goal = "continue the current life stage without adding facts";
    decision.current_topic = "the supplied life-story sequence";
    decision.topic_type = "other";
    decision.topic_beats_remaining = [];
    decision.topic_is_rich = false;
    decision.topic_complete = true;
    decision.next_topic_beat = null;
    decision.return_to_life_roadmap = true;
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
