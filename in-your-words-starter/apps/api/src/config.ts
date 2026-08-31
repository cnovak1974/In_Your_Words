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
const credential = (name: string) => appMode === "mock" ? `mock-${name.toLowerCase()}` : required(name);

export const config = {
  port: Number(process.env.PORT ?? 10000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  databaseUrl: credential("DATABASE_URL"),
  r2: {
    accountId: credential("R2_ACCOUNT_ID"),
    accessKeyId: credential("R2_ACCESS_KEY_ID"),
    secretAccessKey: credential("R2_SECRET_ACCESS_KEY"),
    bucket: credential("R2_BUCKET"),
  },
  deepgramApiKey: credential("DEEPGRAM_API_KEY"),
  openaiApiKey: credential("OPENAI_API_KEY"),
  openaiInterviewModel: process.env.OPENAI_INTERVIEW_MODEL ?? "gpt-5.6-terra",
  elevenLabsApiKey: credential("ELEVENLABS_API_KEY"),
  elevenLabsVoiceId: credential("ELEVENLABS_VOICE_ID"),
  allowDevBootstrap: appMode === "mock" || (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_BOOTSTRAP === "true"),
  elevenLabsModelId: process.env.ELEVENLABS_MODEL_ID ?? "eleven_flash_v2_5",
};
