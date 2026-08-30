import { config } from "./config.js";

export async function synthesizeSpeech(text: string): Promise<ArrayBuffer> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.elevenLabsVoiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": config.elevenLabsApiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: config.elevenLabsModelId,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`ElevenLabs failed: ${response.status} ${await response.text()}`);
  }
  return response.arrayBuffer();
}
