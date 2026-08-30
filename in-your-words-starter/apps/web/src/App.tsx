import { useEffect, useRef, useState } from "react";
import { beginTurn, bootstrap, getSpeech, processTurn, uploadAudio } from "./api";
import { useRecorder } from "./useRecorder";
import "./styles.css";

type UiState = "booting" | "ready" | "recording" | "processing" | "error";

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState("Getting the interview ready…");
  const [state, setState] = useState<UiState>("booting");
  const [error, setError] = useState("");
  const [fontScale, setFontScale] = useState(1);
  const [highContrast, setHighContrast] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const playbackRateRef = useRef(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { recording, start, stop } = useRecorder();

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    bootstrap("Dad")
      .then(({ session }) => {
        setSessionId(session.id);
        setQuestion(session.current_question);
        setState("ready");
        void speak(session.current_question);
      })
      .catch((e) => fail(e));
  }, []);

  async function speak(text: string) {
    if (!text.trim()) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const blob = await getSpeech(text);
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.playbackRate = playbackRateRef.current;
    audioRef.current = audio;
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
  }

  function applyCommand(name?: string) {
    switch (name) {
      case "slower": {
        const next = Math.max(0.7, playbackRateRef.current - 0.1);
        playbackRateRef.current = next; setPlaybackRate(next); break;
      }
      case "faster": {
        const next = Math.min(1.4, playbackRateRef.current + 0.1);
        playbackRateRef.current = next; setPlaybackRate(next); break;
      }
      case "larger_text": setFontScale((v) => Math.min(1.6, v + 0.1)); break;
      case "smaller_text": setFontScale((v) => Math.max(0.8, v - 0.1)); break;
      case "high_contrast": setHighContrast(true); break;
      case "normal_contrast": setHighContrast(false); break;
      case "pause": audioRef.current?.pause(); break;
      case "repeat_question": void speak(question); break;
    }
  }

  async function toggleRecord() {
    if (!sessionId || state === "processing") return;
    try {
      if (!recording) {
        audioRef.current?.pause();
        await start();
        setState("recording");
        return;
      }

      setState("processing");
      const blob = await stop();
      const contentType = blob.type || "audio/webm";
      const { turnId, uploadUrl } = await beginTurn(sessionId, contentType);

      // Permanence-first: raw audio is stored before any transcription/LLM work begins.
      await uploadAudio(uploadUrl, blob, contentType);
      const { decision } = await processTurn(turnId);

      applyCommand(decision.command?.name);
      const oldQuestion = question;
      setQuestion(decision.next_question);
      setState("ready");

      if (decision.intent === "story_answer") {
        await speak(decision.next_question);
      } else {
        await speak(decision.speak_text);
        if (decision.next_question === oldQuestion && decision.speak_text !== oldQuestion) {
          await speak(oldQuestion);
        }
      }
    } catch (e) {
      fail(e);
    }
  }

  function fail(e: unknown) {
    setError(e instanceof Error ? e.message : String(e));
    setState("error");
  }

  return (
    <main className={highContrast ? "app high-contrast" : "app"} style={{ "--font-scale": fontScale } as React.CSSProperties}>
      <section className="question-card" aria-live="polite">
        <div className="eyebrow">IN YOUR WORDS</div>
        <h1>{question}</h1>
      </section>

      <button
        className={recording ? "talk recording" : "talk"}
        onClick={() => void toggleRecord()}
        disabled={state === "booting" || state === "processing" || state === "error"}
        aria-pressed={recording}
      >
        {state === "processing" ? "Working…" : recording ? "Tap when finished" : "Press to talk"}
      </button>

      <div className="status" aria-live="polite">
        {recording && "I'm listening."}
        {state === "processing" && "Saving your recording and preparing the next question."}
        {state === "error" && `Something went wrong: ${error}`}
      </div>
    </main>
  );
}
