import { appMode, config } from "./config.js";

export async function transcribeRemoteAudio(url: string): Promise<string> {
  if (appMode === "mock") return "I remember a small garden behind the house.";
  const endpoint = new URL("https://api.deepgram.com/v1/listen");
  endpoint.searchParams.set("model", "nova-3");
  endpoint.searchParams.set("smart_format", "true");
  endpoint.searchParams.set("punctuate", "true");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Token ${config.deepgramApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    throw new Error(`Deepgram failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json() as any;
  const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim();
  if (!transcript) throw new Error("Deepgram returned an empty transcript");
  return transcript;
}
