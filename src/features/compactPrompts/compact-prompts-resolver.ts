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
 *
 * Does NOT filter by content validity — the raw content is returned
 * even if it's empty or missing the {messages} placeholder. Callers
 * that need a runtime-safe template should use the
 * `WithFallback` variant, which performs the structural safety
 * check and falls back to the base entry if the found content would
 * crash or corrupt compaction.
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
 * Runtime-safe compact template resolution. Returns a template that is
 * structurally sound enough to run through buildSummaryPrompt without
 * corrupting the archive.
 *
 * Safety checks applied in order:
 *   1. Looks up `id` in the merged list. If missing → fall through.
 *   2. If the found content is empty OR missing the `{messages}`
 *      placeholder → treat as broken and fall through. A broken
 *      template is functionally destructive: empty templates send an
 *      empty prompt to the model (either errors or hallucinates), and
 *      placeholder-less templates discard the entire archive and let
 *      the model confidently hallucinate a "summary". The create form
 *      blocks both cases at save time, but this resolver-level check
 *      is the defense-in-depth belt-and-suspenders against a
 *      tampered/corrupt disk file slipping a broken template past the
 *      UI validators.
 *   3. Returns the built-in base entry's content as the ultimate
 *      fallback. The base is frozen in code and known to be valid.
 *
 * Used by the compaction pipeline where a null or broken template
 * would either crash or silently destroy session context.
 */
export function resolveCompactPromptTemplateWithFallback(
  id: string,
  customs: readonly CustomCompactPrompt[],
): string {
  const found = resolveCompactPromptTemplate(id, customs)
  if (found != null && isStructurallyValidTemplate(found)) {
    return found
  }
  if (found != null && !isStructurallyValidTemplate(found)) {
    console.warn(
      `[compact-prompts] template id="${id}" has invalid content (empty or missing {messages} placeholder) — falling back to base`,
    )
  }
  const base = resolveCompactPromptTemplate(BUILT_IN_COMPACT_PROMPT_ID, customs)
  if (base != null && isStructurallyValidTemplate(base)) return base
  // Unreachable — BUILT_IN_COMPACT_PROMPTS is a frozen const with one
  // entry, and its content is known to contain {messages} (verified
  // by the regression tests in compact-prompts-resolver.test.ts).
  throw new Error('[compact-prompts] built-in base prompt missing or structurally invalid')
}

/**
 * Structural validity check for a compact prompt template. A template
 * is valid if it has non-empty content AND contains the `{messages}`
 * placeholder — both necessary to produce a useful summary at runtime.
 *
 * Trimmed content check rejects whitespace-only templates too.
 */
function isStructurallyValidTemplate(content: string): boolean {
  return content.trim().length > 0 && content.includes('{messages}')
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
 * non-positive timestamps. Content MAY be empty at the schema layer —
 * the UI form enforces non-empty with a clearer error; this guard is
 * the schema floor.
 *
 * DUPLICATED IN: electron/main/compact-prompt-store.ts
 *   (isValidStoredCompactPrompt). The two functions must stay in
 *   sync — they implement the same row contract, one for the main
 *   process and one for the renderer. TypeScript's renderer/main
 *   boundary prevents a single shared module. If you change the
 *   validation rules here, update the other file too.
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
