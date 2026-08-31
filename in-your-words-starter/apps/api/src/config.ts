import path from "node:path";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const appMode = process.env.APP_MODE ?? "live";
function provider<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const value = process.env[name] ?? fallback;
  if (!allowed.includes(value as T)) {
    throw new Error(`Invalid ${name}: expected one of ${allowed.join(", ")}`);
  }
  return value as T;
}

export const providers = {
  storage: provider("STORAGE_PROVIDER", ["mock", "r2"] as const, appMode === "live" ? "r2" : "mock"),
  transcription: provider("TRANSCRIPTION_PROVIDER", ["mock", "deepgram"] as const, appMode === "live" ? "deepgram" : "mock"),
  interview: provider("INTERVIEW_PROVIDER", ["mock", "openai"] as const, appMode === "live" ? "openai" : "mock"),
  database: provider("DATABASE_PROVIDER", ["mock", "postgres"] as const, appMode === "live" ? "postgres" : "mock"),
  tts: provider("TTS_PROVIDER", ["mock", "elevenlabs"] as const, appMode === "live" ? "elevenlabs" : "mock"),
};

const credential = (name: string, enabled: boolean) => enabled ? required(name) : `mock-${name.toLowerCase()}`;

export const config = {
  port: Number(process.env.PORT ?? 10000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  publicApiUrl: process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 10000}`,
  databaseUrl: credential("DATABASE_URL", providers.database === "postgres"),
  r2: {
    accountId: credential("R2_ACCOUNT_ID", providers.storage === "r2"),
    accessKeyId: credential("R2_ACCESS_KEY_ID", providers.storage === "r2"),
    secretAccessKey: credential("R2_SECRET_ACCESS_KEY", providers.storage === "r2"),
    bucket: credential("R2_BUCKET", providers.storage === "r2"),
  },
  deepgramApiKey: credential("DEEPGRAM_API_KEY", providers.transcription === "deepgram"),
  openaiApiKey: credential("OPENAI_API_KEY", providers.interview === "openai"),
  openaiInterviewModel: process.env.OPENAI_INTERVIEW_MODEL ?? "gpt-5.6-terra",
  elevenLabsApiKey: credential("ELEVENLABS_API_KEY", providers.tts === "elevenlabs"),
  elevenLabsVoiceId: credential("ELEVENLABS_VOICE_ID", providers.tts === "elevenlabs"),
  allowDevBootstrap: appMode === "mock" || (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_BOOTSTRAP === "true"),
  elevenLabsModelId: process.env.ELEVENLABS_MODEL_ID ?? "eleven_flash_v2_5",
};

