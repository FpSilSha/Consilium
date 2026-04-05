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

## Themes & WCAG Accessibility

Multiple built-in themes beyond the current Deep Ocean palette. Include at least one WCAG AA-compliant high-contrast theme for accessibility. Other theme ideas: light mode, warm/earth tones, monochrome. Each theme defines the full token set (surfaces, content, accents, edges, semantic colors).

## Theme Generator

A visual theme builder where the user sees all UI components (buttons, panels, inputs, scrollbars, cards, modals) rendered live with their current color choices. Controls for:
- Color tokens (surfaces, text, accents, borders, semantic)
- Shape tokens (scrollbar style — rectangular vs pill, border radius, button rounding)
- Save as a named theme JSON file
- Import/export themes to share with others
- Agent accent color palette — define the pool of colors assigned to advisor dots. Users can add/remove colors to prevent repeats when running many advisors. Support preset palettes (e.g., "Neon", "Pastel", "Earth") or fully custom hex lists

## Archetype-on-the-Fly

Allow a user to add an advisor with a blank persona — either letting the model run with its default system prompt (no persona injection) or writing a custom persona inline at spin-up time. Options for the UX:
- **Modal approach** (easiest): when adding an advisor, a modal offers "Choose Persona" (existing .md files), "Blank (model default)", or "Write Custom" (inline textarea that becomes the persona content)
- **Inline approach** (needs design): the advisor list item itself expands into a textarea on creation, collapsing once the user confirms or starts a run
- The custom persona should be saveable as a new .md file for reuse if the user wants to keep it

## Temperature Variation for Duplicate Advisors

When multiple advisors share the same model, inject slight temperature variation per instance so responses naturally diverge. Could be a per-advisor slider in the editor (0.0–2.0) or automatic small offsets (e.g., ±0.1) when duplicates are detected. This complements the duplicate-awareness system prompt hint that already exists — temperature adds randomness at the generation level while the prompt hint encourages topical divergence.

## Enhanced Voting System

### Custom Vote Options

Allow users to define vote options instead of hardcoded YAY/NAY/ABSTAIN. Presets and custom:
- **Binary**: Approve / Reject
- **Agreement scale**: Strongly Agree / Agree / Neutral / Disagree / Strongly Disagree
- **Ranked choice**: Option A / Option B / Option C (user defines options)
- **Priority**: High / Medium / Low
- **Custom**: user types their own options, comma-separated

The vote instruction prompt and response parser adapt to whatever options are provided. The tally panel groups results by the custom options with appropriate visualization (bar chart for scales, counts for binary/ranked).

### Vote-on-Next-Turn (Queued Voting)

Allow calling a vote while a run is active without interrupting the current round:

1. User clicks "Call for Vote" during an active run
2. Current round completes normally (parallel: all finish, sequential: current advisor finishes)
3. Run pauses automatically — similar to the existing pause mechanism
4. Vote round fires — all advisors receive the vote prompt simultaneously
5. Votes collected, tallied, and displayed
6. Run resumes automatically from where it left off

**Implementation approach:**
- Add a `pendingVote` field to the turn slice (question + options, or null)
- In `onTurnComplete`, check for `pendingVote` before dispatching the next turn
- If pending, pause the run, execute the vote, clear `pendingVote`, resume
- The vote prompt is injected into the shared context as `[Vote] question` (existing behavior) so advisors see it in subsequent turns
- UI: Vote button changes to "Vote queued..." while waiting, with an option to cancel the pending vote
