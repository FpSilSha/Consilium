/**
 * Compact Prompts library types.
 *
 * Single category, single consumer surface: both the manual Compact
 * button and the auto-compaction pipeline call into the same resolver
 * with the currently-selected prompt ID. The library has one base
 * entry (extracted from the pre-feature hardcoded
 * `buildSummaryPrompt` in compaction-engine.ts) plus user-created
 * customs.
 *
 * Template placeholder: `{messages}` is substituted with the formatted
 * archive conversation at resolve time. Custom prompts MAY use the
 * placeholder (recommended — without it the model has no context)
 * but the resolver does not require it. An empty or missing
 * `{messages}` placeholder is the user's responsibility.
 *
 * Note on naming: the existing code calls this the "summary prompt"
 * (buildSummaryPrompt), but the feature is user-facing as "Compact
 * Prompts" to align with the Compact button and auto-compaction
 * terminology. Internal types keep the "summary" language where it
 * makes sense to avoid confusing the flow.
 */

export interface CompactPromptEntry {
  readonly id: string
  readonly name: string
  readonly content: string
  readonly isBuiltIn: boolean
}

export interface CustomCompactPrompt {
  readonly id: string
  readonly name: string
  readonly content: string
  readonly createdAt: number
  readonly updatedAt: number
}
