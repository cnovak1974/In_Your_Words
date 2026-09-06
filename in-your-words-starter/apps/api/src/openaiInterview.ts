import OpenAI from "openai";
import { config, providers } from "./config.js";
import { INTERVIEW_INSTRUCTIONS } from "./interviewPrompt.js";

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

export type QuestionStrategy = typeof QUESTION_STRATEGIES[number];
export type StoryHistoryTurn = { question: string; answer: string; strategy?: QuestionStrategy };

export const NARRATIVE_STATES = [
  "scene_open",
  "scene_developing",
  "scene_exhausted",
  "transition_open",
  "milestone_open",
  "timeline_gap",
] as const;

export type NarrativeState = typeof NARRATIVE_STATES[number];

export type InterviewDecision = {
  intent: "story_answer" | "app_question" | "app_command";
  narrative_state: NarrativeState;
  interview_goal: string;
  thread_to_follow: string;
  thread_is_incidental: boolean;
  should_advance: boolean;
  strategy: QuestionStrategy;
  strategy_reason: string;
  next_question: string;
  speak_text: string;
  command: { name: string; value: string | null } | null;
  entities: {
    people: string[];
    places: string[];
    dates: string[];
    organizations: string[];
  };
  contains_unstated_personal_fact: boolean;
  assumption_explanation: string;
};

export const INTERVIEW_DECISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: { type: "string", enum: ["story_answer", "app_question", "app_command"] },
    narrative_state: { type: "string", enum: NARRATIVE_STATES },
    interview_goal: { type: "string" },
    thread_to_follow: { type: "string" },
    thread_is_incidental: { type: "boolean" },
    should_advance: { type: "boolean" },
    strategy: { type: "string", enum: QUESTION_STRATEGIES },
    strategy_reason: { type: "string" },
    next_question: { type: "string" },
    speak_text: { type: "string" },
    command: {
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
    },
    entities: {
      type: "object",
      additionalProperties: false,
      properties: {
        people: { type: "array", items: { type: "string" } },
        places: { type: "array", items: { type: "string" } },
        dates: { type: "array", items: { type: "string" } },
        organizations: { type: "array", items: { type: "string" } }
      },
      required: ["people", "places", "dates", "organizations"]
    },
    contains_unstated_personal_fact: { type: "boolean" },
    assumption_explanation: { type: "string" }
  },
  required: [
    "intent", "narrative_state", "interview_goal", "thread_to_follow", "thread_is_incidental",
    "should_advance", "strategy", "strategy_reason", "next_question", "speak_text", "command", "entities",
    "contains_unstated_personal_fact", "assumption_explanation"
  ]
};

function safeFallbackQuestion() {
  return "What comes back to you about what happened next?";
}

export async function decideNextTurn(args: {
  currentQuestion: string;
  transcript: string;
  storyHistory: StoryHistoryTurn[];
}): Promise<InterviewDecision> {
  if (providers.interview === "mock") {
    const normalized = args.transcript.toLowerCase();
    const base = { entities: { people: [], places: [], dates: [], organizations: [] }, contains_unstated_personal_fact: false, assumption_explanation: "" };
    const appDiagnostics = { narrative_state: "scene_open" as const, interview_goal: "resume the interrupted interview question", thread_to_follow: "the current interview question", thread_is_incidental: false, should_advance: false };
    if (/^(please )?(repeat|talk slower|slow down|talk faster|pause)/.test(normalized)) {
      const name = normalized.includes("slow") ? "slower" : normalized.includes("fast") ? "faster" : normalized.includes("pause") ? "pause" : "repeat_question";
      return { ...base, ...appDiagnostics, intent: "app_command", strategy: "clarify_fact", strategy_reason: "This is an app command, so the current interview question is preserved.", command: { name, value: null }, speak_text: "Okay.", next_question: args.currentQuestion };
    }
    if (normalized.endsWith("?") || /^(what|when|where|who|why|how)\b/.test(normalized)) {
      return { ...base, ...appDiagnostics, intent: "app_question", strategy: "clarify_fact", strategy_reason: "This is an app question, so the current interview question is preserved.", command: null, speak_text: "That information is not available in mock mode.", next_question: args.currentQuestion };
    }
    let narrativeState: NarrativeState = "timeline_gap";
    let interviewGoal = "advance chronology";
    let threadToFollow = "the sequence of events in the storyteller's account";
    let threadIsIncidental = false;
    let shouldAdvance = true;
    let strategy: QuestionStrategy = "continue_timeline";
    let strategyReason = "The answer provides story content that can be advanced chronologically without assuming new details.";
    let next = "What happened next?";
    if (/\b(joined|enlisted in)\b.*\barmy\b/.test(normalized)) {
      narrativeState = "transition_open";
      interviewGoal = "understand a transition";
      threadToFollow = "the transition from work into the Army";
      strategy = "cause_and_effect";
      strategyReason = "The answer links a period of work to joining the Army, so the interview can explore that transition.";
      next = "What led up to joining the Army?";
    } else if (/\bmoved to arizona\b/.test(normalized)) {
      narrativeState = "transition_open";
      interviewGoal = "understand a transition";
      threadToFollow = "how life changed after the move";
      strategy = "transition_milestone";
      strategyReason = "The answer establishes the move to Arizona as a life transition whose effects can move the story forward.";
      next = "How did life change after the move?";
    } else if (/\bdrove all night\b/.test(normalized)) {
      narrativeState = "timeline_gap";
      interviewGoal = "advance chronology";
      threadToFollow = "the overnight journey and what followed";
      threadIsIncidental = true;
      strategyReason = "The completed overnight journey creates a chronological opening, while the vehicle description is incidental.";
      next = "What happened when you got where you were going?";
    } else if (/\b(mom|mother)\b/.test(normalized) && /\b(dad|father)\b/.test(normalized)) {
      narrativeState = "scene_developing";
      interviewGoal = "understand an established relationship";
      threadToFollow = "family life around that time";
      shouldAdvance = false;
      strategy = "deepen_scene";
      strategyReason = "The answer establishes a family scene with simultaneous actions that can unfold further.";
      next = "What were evenings like for your family around that time?";
    } else if (args.storyHistory.at(-1)?.strategy === strategy) {
      narrativeState = "scene_open";
      interviewGoal = "recover one missing action";
      threadToFollow = "what was happening at that point in the story";
      shouldAdvance = false;
      strategy = "deepen_scene";
      strategyReason = "The recent history already moved forward chronologically, so a broad scene question adds variety without assuming details.";
      next = "What was happening around you at that point?";
    }
    const detailStrategies: QuestionStrategy[] = ["deepen_scene", "relationship_context", "clarify_fact", "sensory_recall"];
    const recentQuestionsStayedInScene = args.storyHistory.slice(-2).length === 2 &&
      args.storyHistory.slice(-2).every((turn) => turn.strategy && detailStrategies.includes(turn.strategy));
    if (recentQuestionsStayedInScene && !shouldAdvance) {
      narrativeState = "scene_exhausted";
      interviewGoal = "advance chronology";
      threadToFollow = "what followed the established scene";
      threadIsIncidental = false;
      shouldAdvance = true;
      strategy = "continue_timeline";
      strategyReason = "Two recent questions stayed within the same scene, so the interview should now move forward.";
      next = "What happened next in that period of your life?";
    }
    return { ...base, intent: "story_answer", strategy, strategy_reason: strategyReason, narrative_state: narrativeState, interview_goal: interviewGoal, thread_to_follow: threadToFollow, thread_is_incidental: threadIsIncidental, should_advance: shouldAdvance, command: null, speak_text: next, next_question: next };
  }
  const history = args.storyHistory.slice(-12)
    .map((t, i) => `TURN ${i + 1}\nSTRATEGY: ${t.strategy ?? "unknown"}\nQ: ${t.question}\nA: ${t.answer}`)
    .join("\n\n");

  const input = `CURRENT_QUESTION:\n${args.currentQuestion}\n\nSTORY_HISTORY:\n${history || "(none yet)"}\n\nCURRENT_TRANSCRIPT:\n${args.transcript}`;

  const response = await openai.responses.create({
    model: config.openaiInterviewModel,
    store: false,
    reasoning: { effort: "low" },
    instructions: INTERVIEW_INSTRUCTIONS,
    input,
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "interview_decision",
        strict: true,
        schema: INTERVIEW_DECISION_SCHEMA,
      },
    },
  });

  const parsed = JSON.parse(response.output_text) as InterviewDecision;

  // Fail closed on the model's own grounding check. A separate evaluator can replace this in the next iteration.
  if (parsed.intent === "story_answer" && parsed.contains_unstated_personal_fact) {
    parsed.strategy = "continue_timeline";
    parsed.strategy_reason = "A broad chronological continuation is safest because supplied content does not ground the original question.";
    parsed.narrative_state = "timeline_gap";
    parsed.interview_goal = "advance chronology without adding facts";
    parsed.thread_to_follow = "the next event in the supplied account";
    parsed.thread_is_incidental = false;
    parsed.should_advance = true;
    parsed.next_question = safeFallbackQuestion();
    parsed.speak_text = parsed.next_question;
  }
  return parsed;
}

