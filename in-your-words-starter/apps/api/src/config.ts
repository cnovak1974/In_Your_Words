import path from "node:path";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 10000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  databaseUrl: required("DATABASE_URL"),
  r2: {
    accountId: required("R2_ACCOUNT_ID"),
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    bucket: required("R2_BUCKET"),
  },
  deepgramApiKey: required("DEEPGRAM_API_KEY"),
  openaiApiKey: required("OPENAI_API_KEY"),
  openaiInterviewModel: process.env.OPENAI_INTERVIEW_MODEL ?? "gpt-5.6-terra",
  elevenLabsApiKey: required("ELEVENLABS_API_KEY"),
  elevenLabsVoiceId: required("ELEVENLABS_VOICE_ID"),
  elevenLabsModelId: process.env.ELEVENLABS_MODEL_ID ?? "eleven_flash_v2_5",
};
