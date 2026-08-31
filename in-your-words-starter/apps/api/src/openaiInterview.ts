import OpenAI from "openai";
import { appMode, config } from "./config.js";
import { INTERVIEW_INSTRUCTIONS } from "./interviewPrompt.js";

const openai = new OpenAI({ apiKey: config.openaiApiKey });

export type InterviewDecision = {
  intent: "story_answer" | "app_question" | "app_command";
  speak_text: string;
  next_question: string;
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

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: { type: "string", enum: ["story_answer", "app_question", "app_command"] },
    speak_text: { type: "string" },
    next_question: { type: "string" },
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
    "intent", "speak_text", "next_question", "command", "entities",
    "contains_unstated_personal_fact", "assumption_explanation"
  ]
};

function safeFallbackQuestion() {
  return "What comes back to you about what happened next?";
}

export async function decideNextTurn(args: {
  currentQuestion: string;
  transcript: string;
  storyHistory: Array<{ question: string; answer: string }>;
}): Promise<InterviewDecision> {
  if (appMode === "mock") {
    const normalized = args.transcript.toLowerCase();
    const base = { entities: { people: [], places: [], dates: [], organizations: [] }, contains_unstated_personal_fact: false, assumption_explanation: "" };
    if (/^(please )?(repeat|talk slower|slow down|talk faster|pause)/.test(normalized)) {
      const name = normalized.includes("slow") ? "slower" : normalized.includes("fast") ? "faster" : normalized.includes("pause") ? "pause" : "repeat_question";
      return { ...base, intent: "app_command", command: { name, value: null }, speak_text: "Okay.", next_question: args.currentQuestion };
    }
    if (normalized.endsWith("?") || /^(what|when|where|who|why|how)\b/.test(normalized)) {
      return { ...base, intent: "app_question", command: null, speak_text: "That information is not available in mock mode.", next_question: args.currentQuestion };
    }
    const next = "What else comes back to you about that?";
    return { ...base, intent: "story_answer", command: null, speak_text: next, next_question: next };
  }
  const history = args.storyHistory.slice(-12)
    .map((t, i) => `TURN ${i + 1}\nQ: ${t.question}\nA: ${t.answer}`)
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
        schema,
      },
    },
  });

  const parsed = JSON.parse(response.output_text) as InterviewDecision;

  // Fail closed on the model's own grounding check. A separate evaluator can replace this in the next iteration.
  if (parsed.intent === "story_answer" && parsed.contains_unstated_personal_fact) {
    parsed.next_question = safeFallbackQuestion();
    parsed.speak_text = parsed.next_question;
  }
  return parsed;
}
