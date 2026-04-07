import type { CompactPromptEntry } from './types'

/**
 * Built-in compact prompt — the base entry of the library.
 *
 * Content is the prior hardcoded template from
 * `src/features/compaction/compaction-engine.ts` (`buildSummaryPrompt`)
 * adapted to use the `{messages}` placeholder instead of inline
 * concatenation. The default content must produce byte-identical
 * output to the pre-feature hardcoded prompt so the existing
 * `compaction-engine.test.ts` tests (which pin the specific bullet
 * lines and the 500-word cap mention) continue to pass.
 *
 * If you change this text, update the test expectations in
 * `compaction-engine.test.ts` — they snapshot specific phrases.
 */

const BUILT_IN_COMPACT_PROMPT = `Summarize the following conversation concisely. Preserve:
- Key decisions and conclusions
- Important facts, numbers, and code snippets
- Who said what (using their persona labels)
- Action items and open questions

Keep the summary under 500 words. Use the original persona labels in brackets.

---

{messages}`

/** Stable ID for the built-in entry. Referenced from AppConfig defaults. */
export const BUILT_IN_COMPACT_PROMPT_ID = 'builtin_compact_default'

export const BUILT_IN_COMPACT_PROMPTS: readonly CompactPromptEntry[] = [
  {
    id: BUILT_IN_COMPACT_PROMPT_ID,
    name: 'Standard Summarizer',
    content: BUILT_IN_COMPACT_PROMPT,
    isBuiltIn: true,
  },
]
