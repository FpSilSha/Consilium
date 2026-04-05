# Open Additions

Future feature ideas and enhancements to revisit later.

---

## Voice Mode

Talk instead of type. Either integration with a provider or some other way to allow voice-to-text input, without a service like Aqua Voice.

## LLM Voices (Big Effort)

Different voice styles for different LLMs — each advisor gets a distinct TTS voice matching their persona. May need a pause/queue mechanism so one voice finishes speaking before the next LLM's response begins.

**Caveat:** Parallel mode would just be talking over each other. Would be a funny gag, but need the ability to toggle LLM voice on/off (per advisor or globally). Toggling off means we skip sending the text to the vocalizer service entirely — not just muting — so we don't waste API calls/tokens on TTS that nobody hears.

## Command Palette — Export with Sub-Prompts

The command palette (Ctrl+K) could support export as a multi-step action: selecting "Export" opens a sub-prompt or filter within the palette — e.g., "Export → Full Session / Selection / Single Message". This pattern could extend to other actions that need additional context before executing.

## Streaming Performance — Memoization Pass

Memoize message bubbles and chat components so that only the actively streaming message re-renders, not the entire thread. Profile long sessions and batch streaming updates to prevent jank. Lower priority but important for long conversations.

## Smart Export with LLM Steering

Export dialog with two modes: "Full Chat Log" (current behavior — raw markdown dump) and "Document" where the user provides a prompt to steer LLM-generated output (e.g., "Summarize what was discussed about features", "Extract action items", "Write a technical spec from this discussion"). The LLM processes the conversation through the prompt before export, producing a focused document rather than a raw transcript.

**Warning needed:** When using Document mode, display a warning that the entire chat will be processed through the selected model. Cheaper/smaller models may produce lower quality summaries, miss context, or hallucinate details. Let the user pick which advisor's model to use for the generation, and surface the estimated token cost before confirming.
