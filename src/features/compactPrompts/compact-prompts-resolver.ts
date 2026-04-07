import type { CompactPromptEntry, CustomCompactPrompt } from './types'
import { BUILT_IN_COMPACT_PROMPTS, BUILT_IN_COMPACT_PROMPT_ID } from './built-in-compact-prompts'

/**
 * Pure resolution helpers for the Compact Prompts library.
 *
 * The library has one base entry and N custom entries. Both the
 * manual Compact button and the auto-compaction pipeline call
 * `resolveCompactPromptTemplate(id, customs)` to get the template
 * string, then substitute `{messages}` with the formatted archive
 * before sending to the summarization model.
 *
 * Unlike system prompts, there is no "off" mode — compaction ALWAYS
 * needs a prompt template; skipping it would send a raw message
 * dump to the model with no instructions, which would produce
 * garbage output instead of a summary.
 *
 * Pure functions — no store, no IPC. Tested in isolation.
 */

/**
 * Returns the merged list of compact prompts (base + custom), with
 * built-ins first. Used by the CompactPromptsPane entry list and the
 * default-prompt dropdown in the future Compact settings pane.
 */
export function getMergedCompactPrompts(
  customs: readonly CustomCompactPrompt[],
): readonly CompactPromptEntry[] {
  const base = BUILT_IN_COMPACT_PROMPTS
  const customEntries: CompactPromptEntry[] = customs.map((c) => ({
    id: c.id,
    name: c.name,
    content: c.content,
    isBuiltIn: false,
  }))
  return [...base, ...customEntries]
}

/**
 * Looks up a compact prompt template by id across base + custom.
 * Returns the template content string, or null if the id is unknown.
 * Callers should use `resolveCompactPromptTemplateWithFallback` when
 * they need a guaranteed non-null result.
 */
export function resolveCompactPromptTemplate(
  id: string,
  customs: readonly CustomCompactPrompt[],
): string | null {
  const merged = getMergedCompactPrompts(customs)
  const found = merged.find((p) => p.id === id)
  return found?.content ?? null
}

/**
 * Same as `resolveCompactPromptTemplate` but falls back to the
 * built-in base entry if the id is unknown (e.g., a deleted custom).
 * Used by the compaction pipeline where a null template would crash
 * the summarization call.
 */
export function resolveCompactPromptTemplateWithFallback(
  id: string,
  customs: readonly CustomCompactPrompt[],
): string {
  const found = resolveCompactPromptTemplate(id, customs)
  if (found != null) return found
  const base = resolveCompactPromptTemplate(BUILT_IN_COMPACT_PROMPT_ID, customs)
  if (base != null) return base
  // Unreachable — BUILT_IN_COMPACT_PROMPTS is a frozen const with one entry.
  throw new Error('[compact-prompts] built-in base prompt missing')
}

/**
 * Substitutes the `{messages}` placeholder in a compact prompt
 * template with the formatted archive content. Single-pass regex
 * (same pattern as persona-switch substitution) so a `{messages}`
 * token inside a message's own text cannot cascade.
 *
 * Unknown placeholder tokens are left as literal text — we don't
 * error on unrecognized `{foo}` patterns because the user might be
 * writing comments in their custom prompts.
 */
export function substituteCompactPlaceholders(
  template: string,
  messages: string,
): string {
  return template.replace(/\{messages\}/g, () => messages)
}

/**
 * Type guard for a single persisted row from custom-compact-prompts.json.
 * Rejects rows missing required fields, with empty id/name, or with
 * non-positive timestamps. Content MAY be empty — an empty custom
 * compact prompt is allowed (the user can define a no-op template)
 * but will produce poor summaries; we don't block it in the guard
 * because the UI validator enforces non-empty with a clearer message.
 */
export function isValidStoredCompactPrompt(entry: unknown): entry is {
  id: string
  name: string
  content: string
  createdAt: number
  updatedAt: number
} {
  if (entry == null || typeof entry !== 'object') return false
  const e = entry as Record<string, unknown>
  return (
    typeof e['id'] === 'string' && e['id'] !== '' &&
    typeof e['name'] === 'string' && e['name'] !== '' &&
    typeof e['content'] === 'string' &&
    typeof e['createdAt'] === 'number' && Number.isFinite(e['createdAt']) && e['createdAt'] > 0 &&
    typeof e['updatedAt'] === 'number' && Number.isFinite(e['updatedAt']) && e['updatedAt'] > 0
  )
}
