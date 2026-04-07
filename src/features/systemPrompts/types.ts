/**
 * System prompt library types — shared between renderer and main process.
 *
 * Two categories live in one library because they share the same
 * structural shape (id, name, content) and the same CRUD lifecycle. The
 * `category` discriminator keeps them apart in the UI (two sub-sections
 * in the System Prompts pane) and at resolution time (each category has
 * its own mode/customId pair in AppConfig).
 *
 * Categories:
 *
 *   advisor          — Layer 1 of the three-layer system prompt sent
 *                      to every advisor on every turn. The base entry
 *                      is the prior hardcoded APP_LEVEL_PROMPT extracted
 *                      from src/services/context-bus/system-prompt.ts.
 *
 *   persona-switch   — The summarization prompt template used when an
 *                      advisor's persona is swapped mid-session. The
 *                      base entry is extracted from
 *                      src/features/compaction/persona-switch.ts. The
 *                      template uses {oldLabel}, {newLabel}, and
 *                      {messages} placeholders that the resolver fills
 *                      in at switch time.
 *
 * Each category has three modes:
 *
 *   base    — use the built-in entry (default)
 *   custom  — use a user-created entry by id
 *   off     — skip the prompt entirely. For 'advisor', this means no
 *             Layer 1 is sent (just persona + session instructions).
 *             For 'persona-switch', this means no summarization runs
 *             when an advisor switches personas — the new persona
 *             starts with no compacted reframing.
 */

export type SystemPromptCategory = 'advisor' | 'persona-switch'

export type SystemPromptMode = 'base' | 'custom' | 'off'

export interface SystemPromptEntry {
  readonly id: string
  readonly category: SystemPromptCategory
  readonly name: string
  readonly content: string
  readonly isBuiltIn: boolean
}

export interface SystemPromptsState {
  readonly advisorMode: SystemPromptMode
  readonly advisorCustomId: string | null
  readonly personaSwitchMode: SystemPromptMode
  readonly personaSwitchCustomId: string | null
}
