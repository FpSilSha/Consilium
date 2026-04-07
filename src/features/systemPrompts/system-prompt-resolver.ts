import type { SystemPromptEntry, SystemPromptsState, SystemPromptCategory } from './types'
import {
  BUILT_IN_SYSTEM_PROMPTS,
  BUILT_IN_ADVISOR_PROMPT_ID,
  BUILT_IN_PERSONA_SWITCH_PROMPT_ID,
} from './built-in-system-prompts'

/**
 * Pure resolution functions for the two system-prompt categories.
 * Given the current mode + customId + the custom-entries array, return
 * the concrete prompt string (or null/empty to signal "off" / "skip").
 *
 * Kept pure so the full branching matrix can be unit-tested without
 * Zustand, React, or IPC — see system-prompt-resolver.test.ts.
 *
 * Fallback philosophy: if the current config points to a custom entry
 * that no longer exists (renamed, deleted on this machine, migrated
 * between machines), the resolver falls back to the BASE entry rather
 * than returning null — so the user's advisors continue to work with
 * "reasonable default" behavior even when their custom references are
 * stale. The startup validator (useStartupCustomSystemPrompts) also
 * repairs the config.json file on the next launch so the fallback is
 * a one-session degradation.
 *
 * 'off' is honored literally — if the user chose 'off', we return the
 * null/empty signal even when a custom entry exists. 'off' is an
 * intentional override, not an error state.
 */

/**
 * Resolves the advisor Layer 1 system prompt.
 *
 *   - 'base':   returns the built-in ADVISOR_BASE_PROMPT content
 *   - 'custom': returns the custom entry's content, or the base
 *               content if the custom id is missing
 *   - 'off':    returns '' (empty string — buildSystemPrompt skips
 *               empty layers, so no Layer 1 is sent)
 *
 * Returning an empty string for 'off' integrates cleanly with the
 * existing buildSystemPrompt layer-skipping logic — no new code path
 * in buildSystemPrompt is required to support off.
 */
export function resolveAdvisorSystemPrompt(
  config: SystemPromptsState,
  customs: readonly SystemPromptEntry[],
): string {
  if (config.advisorMode === 'off') return ''
  if (config.advisorMode === 'custom' && config.advisorCustomId != null) {
    const custom = customs.find(
      (e) => e.id === config.advisorCustomId && e.category === 'advisor',
    )
    if (custom != null) return custom.content
    // Stale custom reference — fall back to base silently. The startup
    // validator catches this on next launch and repairs config.
  }
  return getBuiltIn('advisor').content
}

/**
 * Resolves the persona-switch summarization prompt template. The caller
 * is responsible for substituting placeholders via
 * `substitutePersonaSwitchPlaceholders` — this function only returns
 * the template string.
 *
 * Returns null when mode is 'off', signalling the caller to skip
 * summarization entirely and just perform the persona swap without
 * reframing the conversation history.
 */
export function resolvePersonaSwitchPromptTemplate(
  config: SystemPromptsState,
  customs: readonly SystemPromptEntry[],
): string | null {
  if (config.personaSwitchMode === 'off') return null
  if (config.personaSwitchMode === 'custom' && config.personaSwitchCustomId != null) {
    const custom = customs.find(
      (e) => e.id === config.personaSwitchCustomId && e.category === 'persona-switch',
    )
    if (custom != null) return custom.content
  }
  return getBuiltIn('persona-switch').content
}

/**
 * Substitutes the {oldLabel}, {newLabel}, and {messages} placeholders
 * in a persona-switch prompt template. Unknown placeholders are left
 * as literal text — we intentionally do NOT error on unknown tokens
 * because the user may use them as literal content in their prompts.
 *
 * Single-pass substitution via regex callback — important for
 * correctness when a placeholder VALUE happens to contain another
 * placeholder token. For example, if a persona is named literally
 * "{newLabel}", a sequential .replaceAll('{oldLabel}', ...) followed
 * by .replaceAll('{newLabel}', ...) would cascade: the second
 * replaceAll would substitute the literal "{newLabel}" injected by
 * the first call, silently corrupting the prompt. Persona labels
 * come from user-typed names, so this is a real (if rare) input
 * path. The single-pass regex visits each token in the TEMPLATE
 * exactly once and never re-scans values.
 */
export function substitutePersonaSwitchPlaceholders(
  template: string,
  values: { readonly oldLabel: string; readonly newLabel: string; readonly messages: string },
): string {
  return template.replace(/\{(oldLabel|newLabel|messages)\}/g, (_match, token: string) => {
    if (token === 'oldLabel') return values.oldLabel
    if (token === 'newLabel') return values.newLabel
    if (token === 'messages') return values.messages
    return _match
  })
}

function getBuiltIn(category: SystemPromptCategory): SystemPromptEntry {
  const id = category === 'advisor' ? BUILT_IN_ADVISOR_PROMPT_ID : BUILT_IN_PERSONA_SWITCH_PROMPT_ID
  const entry = BUILT_IN_SYSTEM_PROMPTS.find((e) => e.id === id)
  if (entry == null) {
    // Unreachable while the built-in IDs are in sync with the array.
    // Throw rather than fall back to empty — a missing built-in at
    // runtime is a programmer error and should crash loudly in dev.
    throw new Error(`[system-prompts] built-in entry for category "${category}" not found`)
  }
  return entry
}

/**
 * The default SystemPromptsState used by new installs and as the
 * fallback when config.json is missing or the persisted values fail
 * validation. Everything defaults to 'base' — the current behavior
 * before this feature landed.
 */
export const DEFAULT_SYSTEM_PROMPTS_STATE: SystemPromptsState = {
  advisorMode: 'base',
  advisorCustomId: null,
  personaSwitchMode: 'base',
  personaSwitchCustomId: null,
}

/**
 * Type guard for persisted config values. Validates that the four
 * fields exist and are in their valid value spaces. Used by the
 * startup loader to reject corrupted config.json entries and fall
 * back to defaults.
 *
 * Note: this does NOT validate that the customId references an entry
 * that actually exists in the custom library — that check happens in
 * the runtime resolver (silent fallback to base) and in the startup
 * reconciliation pass (which repairs config.json when a referenced
 * custom is gone).
 */
export function isValidSystemPromptsState(value: unknown): value is SystemPromptsState {
  if (value == null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  const validModes = ['base', 'custom', 'off']
  if (typeof v['advisorMode'] !== 'string' || !validModes.includes(v['advisorMode'])) return false
  if (typeof v['personaSwitchMode'] !== 'string' || !validModes.includes(v['personaSwitchMode'])) return false
  const advisorId = v['advisorCustomId']
  if (advisorId !== null && typeof advisorId !== 'string') return false
  const switchId = v['personaSwitchCustomId']
  if (switchId !== null && typeof switchId !== 'string') return false
  return true
}
