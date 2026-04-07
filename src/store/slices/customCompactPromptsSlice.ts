import type { StateCreator } from 'zustand'
import type { CustomCompactPrompt } from '@/features/compactPrompts/types'
import { BUILT_IN_COMPACT_PROMPT_ID } from '@/features/compactPrompts/built-in-compact-prompts'

/**
 * Custom Compact Prompts slice — customs only. The built-in base
 * entry lives in code and is merged in by the resolver at call time.
 *
 * Also holds the currently-selected compactPromptId — mirrored from
 * AppConfig at startup and written back to disk on every change via
 * the CompactPromptsPane. The selection is a single value (no per-
 * feature override) because both the manual Compact button and
 * auto-compaction read from the same source.
 */

export interface CustomCompactPromptsSlice {
  readonly customCompactPrompts: readonly CustomCompactPrompt[]
  readonly compactPromptId: string
  setCustomCompactPrompts: (entries: readonly CustomCompactPrompt[]) => void
  addCustomCompactPrompt: (entry: CustomCompactPrompt) => void
  removeCustomCompactPrompt: (id: string) => void
  setCompactPromptId: (id: string) => void
}

const RESERVED_IDS: ReadonlySet<string> = new Set([BUILT_IN_COMPACT_PROMPT_ID])

function isReservedId(id: string): boolean {
  return id.startsWith('builtin_') || RESERVED_IDS.has(id)
}

export const createCustomCompactPromptsSlice: StateCreator<CustomCompactPromptsSlice> = (set) => ({
  customCompactPrompts: [],
  // Default matches the main-process DEFAULT_CONFIG value. Both have
  // to stay in sync with BUILT_IN_COMPACT_PROMPT_ID — see the
  // comments in both places. Startup loader will overwrite this with
  // the persisted value from config.json.
  compactPromptId: BUILT_IN_COMPACT_PROMPT_ID,

  setCustomCompactPrompts: (entries) => set({ customCompactPrompts: entries }),

  addCustomCompactPrompt: (entry) =>
    set((state) => {
      // Reject reserved IDs — the builtin_ prefix convention and the
      // concrete built-in id. A shadow entry would produce duplicate
      // dropdown options and confuse the resolver (base wins in the
      // merged list, so the custom would be invisible and hard to
      // delete through the UI).
      if (isReservedId(entry.id)) {
        console.error(
          `[compact-prompts] addCustomCompactPrompt refused id "${entry.id}" — reserved for base prompt or builtin_ prefix`,
        )
        return state
      }
      const idx = state.customCompactPrompts.findIndex((e) => e.id === entry.id)
      const next =
        idx === -1
          ? [...state.customCompactPrompts, entry]
          : [
              ...state.customCompactPrompts.slice(0, idx),
              entry,
              ...state.customCompactPrompts.slice(idx + 1),
            ]
      return { customCompactPrompts: next }
    }),

  removeCustomCompactPrompt: (id) =>
    set((state) => {
      if (isReservedId(id)) return state
      const next = state.customCompactPrompts.filter((e) => e.id !== id)
      if (next.length === state.customCompactPrompts.length) return state
      return { customCompactPrompts: next }
    }),

  setCompactPromptId: (id) => set({ compactPromptId: id }),
})
