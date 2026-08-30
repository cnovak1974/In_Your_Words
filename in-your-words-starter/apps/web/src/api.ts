const API = import.meta.env.VITE_API_URL ?? "http://localhost:10000";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${url}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function bootstrap(name: string) {
  return json<{ session: { id: string; current_question: string } }>("/api/dev/bootstrap", {
    method: "POST", body: JSON.stringify({ name }),
  });
}

export async function beginTurn(sessionId: string, contentType: string) {
  return json<{ turnId: string; uploadUrl: string; contentType: string }>("/api/turns/begin", {
    method: "POST", body: JSON.stringify({ sessionId, contentType }),
  });
}

export async function uploadAudio(uploadUrl: string, blob: Blob, contentType: string) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!response.ok) throw new Error(`R2 upload failed: ${response.status}`);
}

export async function processTurn(turnId: string) {
  return json<{
    transcript: string;
    decision: {
      intent: "story_answer" | "app_question" | "app_command";
      speak_text: string;
      next_question: string;
      command: { name: string; value: string | null } | null;
    };
  }>(`/api/turns/${turnId}/process`, { method: "POST", body: "{}" });
}

export async function getSpeech(text: string) {
  const response = await fetch(`${API}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.blob();
}
