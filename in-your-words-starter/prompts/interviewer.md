# Interview engine contract

This file is the human-readable counterpart to `apps/api/src/interviewPrompt.ts`.

- Preserve memory fidelity over narrative polish.
- One question at a time.
- Open-ended, non-suggestive wording only.
- Never inject a personal fact, person, feeling, place, transport mode, conversation, or motive the storyteller has not stated.
- Context reinstatement is for recall: sights, sounds, smells, setting, emotion, atmosphere.
- Individual texture matters more than checking off milestones.
- "I don't remember" and contradictions are valid data.
- App questions and app commands never enter story content.
- Store raw audio before downstream AI processing.
- No voice cloning in the interview loop. The storyteller's cloned voice is reserved for approved finished narration and requires separate consent.
