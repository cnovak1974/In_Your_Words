# Interview engine contract

This file is the human-readable counterpart to the two-pass contracts in `apps/api/src/interviewPrompt.ts`.

- Preserve memory fidelity over narrative polish.
- One question at a time.
- Open-ended, non-suggestive wording only.
- Never inject a personal fact, person, feeling, place, transport mode, conversation, or motive the storyteller has not stated.
- Context reinstatement is for recall: sights, sounds, smells, setting, emotion, atmosphere.
- Follow the story rather than automatically probing the latest noun or phrase.
- Choose an explicit interview strategy before writing each question: deepen a scene, continue the timeline, add relationship context, explore cause and effect, clarify a fact, invite selective sensory recall, ask significance, compare established periods, or transition through an established milestone.
- Favor narrative movement and vary recent question strategies; move on when a thread becomes brief or repetitive.
- Avoid defaulting to “What do you remember about…”, “What else do you remember about…”, or “Tell me more about…”.
- Do not over-interrogate incidental objects, scenery, weather, furnishings, or clothing.
- Before drafting a question, assess narrative state, interview goal, whether the candidate thread is incidental, and whether chronology should advance; only then select a strategy and wording.
- A newly mentioned noun or descriptive detail cannot become the next subject unless it carries action, change, relationship, chronology, explicit emphasis, or an important unresolved point.
- After a complete action or transition, prefer what happened next or what changed.
- After two consecutive detail questions in one scene, normally advance chronology or transition.
- Pass 1 is an interview planner. It assesses story position, unfinished business, narrative state, goal, thread, whether the thread is incidental, whether to advance, next move, strategy, and a question objective. It cannot generate question wording.
- The planner also tracks the broader life stage and its remaining goal, while keeping a meaningful current topic on a distinct-beat mini-arc.
- A new story normally establishes childhood place, family life, interests, everyday life, and change with age before moving forward, unless the storyteller's content calls for a different route.
- Rich topics can receive several questions, but each question advances to a distinct unanswered beat. Incidental nouns never create new beats.
- The planner explicitly decides whether the current topic is rich or complete, selects the next topic beat, and decides whether to return to the life-stage roadmap.
- Pass 2 is a question writer. It receives the complete plan and may only turn its objective into one grounded question; it cannot select another life stage, topic, topic beat, thread, strategy, move, or objective.
- App questions and ordinary app commands return directly from the planner without the story-question writer.
- Individual texture matters more than checking off milestones.
- "I don't remember" and contradictions are valid data.
- App questions and app commands never enter story content.
- Store raw audio before downstream AI processing.
- No voice cloning in the interview loop. The storyteller's cloned voice is reserved for approved finished narration and requires separate consent.
