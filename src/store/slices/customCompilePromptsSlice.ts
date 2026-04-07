import type { StateCreator } from 'zustand'
import type { CustomCompilePrompt } from '@/features/compilePrompts/types'
import { COMPILE_PRESETS } from '@/features/chat/compile-presets'

// Reserved IDs the library must never let customs shadow. Includes
// both the `builtin_` prefix convention used by personas/system-prompts
// AND the concrete IDs of the 5 base compile presets (which don't use
// a `builtin_` prefix — they're 'comprehensive', 'brief', 'minutes',
// 'essay', 'qa-digest'). Without this check, a custom with
// id='comprehensive' would coexist in the store with the base entry
// at the same id, producing a duplicate dropdown option and a ghost
// row in CompilePromptsPane. Computed once at module load.
const RESERVED_BASE_PRESET_IDS: ReadonlySet<string> = new Set(COMPILE_PRESETS.map((p) => p.id))

function isReservedId(id: string): boolean {
  return id.startsWith('builtin_') || RESERVED_BASE_PRESET_IDS.has(id)
}

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
      // Refuse reserved IDs: the 'builtin_' prefix (convention used by
      // other libraries) AND the 5 base preset IDs ('comprehensive',
      // 'brief', 'minutes', 'essay', 'qa-digest'). A shadow entry
      // would produce duplicates in the merged list — the resolver
      // prefers base, so the custom would be invisible in the
      // dropdown and its delete button would wipe the custom (correct)
      // but the base entry would remain (confusing "it came back").
      if (isReservedId(entry.id)) {
        console.error(
          `[compile-prompts] addCustomCompilePrompt refused id "${entry.id}" — reserved for base prompts or builtin_ prefix`,
        )
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
      // Refuse to remove a reserved ID: it either doesn't exist in
      // customCompilePrompts (built-ins aren't here) or it's a
      // shadow entry that addCustomCompilePrompt's guard should
      // have rejected at write time. Either way, silent no-op.
      if (isReservedId(id)) return state
      const next = state.customCompilePrompts.filter((e) => e.id !== id)
      if (next.length === state.customCompilePrompts.length) return state
      return { customCompilePrompts: next }
    }),
})
