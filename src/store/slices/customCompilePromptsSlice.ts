import type { StateCreator } from 'zustand'
import type { CustomCompilePrompt } from '@/features/compilePrompts/types'

/**
 * Custom Compile Prompts slice — holds user-created compile prompt
 * entries loaded from {userData}/custom-compile-prompts.json at
 * startup.
 *
 * Unlike personas, there's no "merged list" field on the store.
 * Consumers (CompileDocumentButton dropdown, CompileSettingsModal
 * dropdown, DocumentsPanel label lookup) go through the resolver in
 * `src/features/compilePrompts/compile-prompts-resolver.ts` which
 * combines the base COMPILE_PRESETS with this slice's
 * customCompilePrompts at call time.
 */

export interface CustomCompilePromptsSlice {
  readonly customCompilePrompts: readonly CustomCompilePrompt[]
  setCustomCompilePrompts: (entries: readonly CustomCompilePrompt[]) => void
  addCustomCompilePrompt: (entry: CustomCompilePrompt) => void
  removeCustomCompilePrompt: (id: string) => void
}

export const createCustomCompilePromptsSlice: StateCreator<CustomCompilePromptsSlice> = (set) => ({
  customCompilePrompts: [],

  setCustomCompilePrompts: (entries) => set({ customCompilePrompts: entries }),

  addCustomCompilePrompt: (entry) =>
    set((state) => {
      // Refuse IDs matching any built-in preset id (e.g., 'comprehensive')
      // and refuse the 'builtin_' prefix. A user shadowing a base
      // entry's id would produce duplicates in the merged list. The
      // resolver prefers base entries, so the custom would be
      // effectively invisible and undeletable (delete cascade would
      // hit the wrong row). Symmetric with removeCustomCompilePrompt.
      if (entry.id.startsWith('builtin_')) {
        console.error(`[compile-prompts] addCustomCompilePrompt refused id "${entry.id}" — builtin_ prefix is reserved`)
        return state
      }
      const idx = state.customCompilePrompts.findIndex((e) => e.id === entry.id)
      const next =
        idx === -1
          ? [...state.customCompilePrompts, entry]
          : [
              ...state.customCompilePrompts.slice(0, idx),
              entry,
              ...state.customCompilePrompts.slice(idx + 1),
            ]
      return { customCompilePrompts: next }
    }),

  removeCustomCompilePrompt: (id) =>
    set((state) => {
      if (id.startsWith('builtin_')) return state
      const next = state.customCompilePrompts.filter((e) => e.id !== id)
      if (next.length === state.customCompilePrompts.length) return state
      return { customCompilePrompts: next }
    }),
})
