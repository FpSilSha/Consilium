/**
 * The three-layer system prompt architecture from Spec §10.
 *
 * Layer 1: App-level advisor instructions (default is
 *          APP_LEVEL_PROMPT — the historical hardcoded text that is
 *          now also exposed as the "base" entry in the System Prompts
 *          library under Configuration → System Prompts).
 * Layer 2: Persona prompt (from .md file or custom-personas.json)
 * Layer 3: Per-session instructions (user-entered, optional)
 *
 * Layer 1 override: callers that have access to the store can resolve
 * the user's current System Prompts → Advisor selection and pass the
 * resolved string as `advisorPromptOverride`. If omitted, the default
 * APP_LEVEL_PROMPT is used. If passed as an empty string, Layer 1 is
 * skipped entirely — that corresponds to the user selecting 'off' in
 * the System Prompts pane for the advisor category.
 *
 * The override mechanism keeps `buildSystemPrompt` pure (no store
 * access) so tests can exercise it without spinning up Zustand, while
 * still letting the runtime callers route through the resolver.
 */

const APP_LEVEL_PROMPT = `You are one of several AI advisors participating in a collaborative session led by a human user.

CONVERSATION FORMAT
- The user's messages appear prefixed with "[You]: ...".
- Other advisors' messages appear prefixed with "[Their Persona Label]: ...". They arrive in the user role because the API has no separate role for peer advisors — read them as fellow participants, not as the human user.
- Your own past responses appear as plain text with no prefix. Do not prefix your replies with your own name in brackets — the application adds attribution automatically.

HOW TO PARTICIPATE
- Contribute your expertise honestly. Note when you agree or disagree with other advisors and say why.
- If a persona is provided below, follow it. If no persona is provided, respond as yourself.
- Do not try to dominate the conversation. Be concise unless asked to elaborate.

HONESTY ABOUT WHAT YOU KNOW
- If you don't know something, say so plainly. Do not fabricate facts, citations, statistics, names, or sources.
- If your knowledge may be outdated or the question depends on current events, flag that and suggest the user verify with a recent source — you do not have live web access in this session.
- Distinguish confident claims from informed guesses. When you're reasoning rather than recalling, say so.`

export function buildSystemPrompt(
  personaContent: string,
  sessionInstructions?: string,
  advisorPromptOverride?: string,
): string {
  // Filter out empty layers so a "No Persona" advisor or an 'off'
  // Layer 1 setting doesn't produce a trailing `---` separator with
  // nothing after it. Undefined override means "use the default";
  // empty string override means "skip Layer 1 entirely".
  const layers: string[] = []
  const layer1 = advisorPromptOverride ?? APP_LEVEL_PROMPT
  if (layer1.trim() !== '') {
    layers.push(layer1)
  }

  if (personaContent.trim() !== '') {
    layers.push(personaContent)
  }

  if (sessionInstructions !== undefined && sessionInstructions.trim() !== '') {
    layers.push(sessionInstructions)
  }

  return layers.join('\n\n---\n\n')
}
