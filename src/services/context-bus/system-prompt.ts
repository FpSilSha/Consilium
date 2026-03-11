/**
 * The three-layer system prompt architecture from Spec §10.
 *
 * Layer 1: App-level (hardcoded, hidden from user)
 * Layer 2: Persona prompt (from .md file)
 * Layer 3: Per-session instructions (user-entered, optional)
 */

const APP_LEVEL_PROMPT = `You are one of several AI advisors participating in a collaborative session. A human user is leading the discussion. Other AI models may also be participating — their responses will appear in the conversation with identity headers in square brackets indicating their role. Your role is to contribute your expertise honestly, note when you agree or disagree with other advisors, and follow the persona instructions given to you below. Do not try to dominate the conversation. Be concise unless asked to elaborate.`

export function buildSystemPrompt(
  personaContent: string,
  sessionInstructions?: string,
): string {
  const layers = [APP_LEVEL_PROMPT, personaContent]

  if (sessionInstructions !== undefined && sessionInstructions.trim() !== '') {
    layers.push(sessionInstructions)
  }

  return layers.join('\n\n---\n\n')
}
