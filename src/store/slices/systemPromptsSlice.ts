import type { StateCreator } from 'zustand'
import type { SystemPromptEntry, SystemPromptsState } from '@/features/systemPrompts/types'
import { DEFAULT_SYSTEM_PROMPTS_STATE } from '@/features/systemPrompts/system-prompt-resolver'

/**
 * System Prompts library slice.
 *
 * Holds two things:
 *
 *   - `customSystemPrompts`: the array of user-created entries (both
 *     categories combined). Loaded from disk at startup, mutated by
 *     the System Prompts pane, persisted via the
 *     `system-prompts:save/delete` IPC handlers.
 *
 *   - `systemPromptsConfig`: the SystemPromptsState currently in
 *     effect (mode + customId for each category). Mirrored from
 *     AppConfig in config.json at startup and rewritten back to disk
 *     whenever the user changes a mode or custom selection in the
 *     pane. Consumers (buildSystemPrompt callers, persona-switch)
 *     read this alongside `customSystemPrompts` and call the pure
 *     resolvers in `system-prompt-resolver.ts` to get the concrete
 *     prompt string.
 *
 * Unlike the personas slice, there is NO merged-list invariant to
 * maintain. Consumers of system prompts always go through the
 * resolver, which knows how to combine the built-in entries with the
 * customs on the fly. That keeps this slice small and avoids two
 * sources of truth.
 *
 * Store-side actions are in-memory only. Disk persistence is the
 * caller's responsibility — see the System Prompts pane for the
 * disk-first save flow.
 */

export interface SystemPromptsSlice {
  readonly customSystemPrompts: readonly SystemPromptEntry[]
  readonly systemPromptsConfig: SystemPromptsState
  setCustomSystemPrompts: (entries: readonly SystemPromptEntry[]) => void
  addCustomSystemPrompt: (entry: SystemPromptEntry) => void
  removeCustomSystemPrompt: (id: string) => void
  setSystemPromptsConfig: (config: SystemPromptsState) => void
}

export const createSystemPromptsSlice: StateCreator<SystemPromptsSlice> = (set) => ({
  customSystemPrompts: [],
  systemPromptsConfig: DEFAULT_SYSTEM_PROMPTS_STATE,

  setCustomSystemPrompts: (entries) => set({ customSystemPrompts: entries }),

  addCustomSystemPrompt: (entry) =>
    set((state) => {
      // Symmetric guard with removeCustomSystemPrompt and the personas
      // slice: refuse to insert an entry using a `builtin_` prefixed
      // ID to prevent shadowing a built-in prompt with a custom one.
      if (entry.id.startsWith('builtin_')) {
        console.error(`[system-prompts] addCustomSystemPrompt refused id "${entry.id}" — builtin_ prefix is reserved`)
        return state
      }
      const idx = state.customSystemPrompts.findIndex((e) => e.id === entry.id)
      const next =
        idx === -1
          ? [...state.customSystemPrompts, entry]
          : [
              ...state.customSystemPrompts.slice(0, idx),
              entry,
              ...state.customSystemPrompts.slice(idx + 1),
            ]
      return { customSystemPrompts: next }
    }),

  removeCustomSystemPrompt: (id) =>
    set((state) => {
      if (id.startsWith('builtin_')) return state
      const next = state.customSystemPrompts.filter((e) => e.id !== id)
      if (next.length === state.customSystemPrompts.length) return state
      return { customSystemPrompts: next }
    }),

  setSystemPromptsConfig: (config) => set({ systemPromptsConfig: config }),
})
