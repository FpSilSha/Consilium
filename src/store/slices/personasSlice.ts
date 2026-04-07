import type { StateCreator } from 'zustand'
import type { Persona } from '@/types'
import { BUILT_IN_PERSONAS, sortPersonas } from '@/features/personas'

/**
 * Personas slice — owns both the built-in personas (always present) and
 * any user-created custom personas (loaded from disk at startup, mutated
 * via the Personas pane in ConfigurationModal).
 *
 * The slice exposes ONE list to the UI — `personas` — which is always
 * the merged-and-sorted union of built-ins and customs. The advisor
 * dropdown and every other consumer treats this list as read-only and
 * doesn't need to know whether an entry is built-in or custom (the
 * `isBuiltIn` flag on each Persona handles that distinction at render
 * time, e.g., for hiding the delete button on built-ins).
 *
 * `customPersonas` is exposed separately so the Personas pane can render
 * the Custom tab without having to filter the merged list, and so the
 * startup loader has somewhere to put the disk-loaded entries before
 * they're merged.
 *
 * The CRUD actions (`addCustomPersona`, `removeCustomPersona`,
 * `setCustomPersonas`) update BOTH `customPersonas` AND `personas` in
 * the same `set` call. The merged-list reconciliation lives here so it
 * happens atomically with each mutation — keeping it in a separate
 * useEffect or selector would risk a transient state where one list is
 * updated and the other is stale.
 *
 * IMPORTANT: these actions only update the in-memory store. The disk
 * write is the caller's responsibility (the Personas pane awaits the
 * `personas:save` IPC and only calls `addCustomPersona` on success).
 * Splitting it this way means the store stays sync — important for
 * Zustand selectors — and the disk write can fail-loud rather than
 * silently desyncing the UI.
 */

export interface PersonasSlice {
  /** Merged built-in + custom personas, sorted (built-in first, then alphabetical). */
  readonly personas: readonly Persona[]
  /** Custom personas only — used by the Personas pane Custom tab. */
  readonly customPersonas: readonly Persona[]
  readonly personasLoaded: boolean
  setPersonas: (personas: readonly Persona[]) => void
  setPersonasLoaded: (loaded: boolean) => void
  /**
   * Bulk replace the custom personas list. Used by the startup loader
   * after reading from disk. Built-in personas are unaffected.
   */
  setCustomPersonas: (customs: readonly Persona[]) => void
  /**
   * Insert or update a custom persona by ID. Reconciles `personas` so
   * the merged list reflects the change immediately.
   */
  addCustomPersona: (persona: Persona) => void
  /**
   * Remove a custom persona by ID. No-op if the ID is not present (or
   * if it's a built-in — the action ignores built-in IDs to prevent
   * accidental deletion). Reconciles `personas`.
   */
  removeCustomPersona: (id: string) => void
}

function mergeAndSort(customs: readonly Persona[]): readonly Persona[] {
  return sortPersonas([...BUILT_IN_PERSONAS, ...customs])
}

// Initial value of `personas`. Computed via mergeAndSort so the
// post-mutation invariant ("personas is always merged-and-sorted") holds
// from t=0 — without this, the initial render shows built-ins in
// declaration order but the first mutation would re-sort them, causing a
// visible re-order in the UI on the user's first edit.
const INITIAL_MERGED_PERSONAS = mergeAndSort([])

export const createPersonasSlice: StateCreator<PersonasSlice> = (set) => ({
  personas: INITIAL_MERGED_PERSONAS,
  customPersonas: [],
  personasLoaded: false,

  setPersonas: (personas) => set({ personas }),

  setPersonasLoaded: (loaded) => set({ personasLoaded: loaded }),

  setCustomPersonas: (customs) =>
    set({
      customPersonas: customs,
      personas: mergeAndSort(customs),
    }),

  addCustomPersona: (persona) =>
    set((state) => {
      const idx = state.customPersonas.findIndex((p) => p.id === persona.id)
      const nextCustoms =
        idx === -1
          ? [...state.customPersonas, persona]
          : [
              ...state.customPersonas.slice(0, idx),
              persona,
              ...state.customPersonas.slice(idx + 1),
            ]
      return {
        customPersonas: nextCustoms,
        personas: mergeAndSort(nextCustoms),
      }
    }),

  removeCustomPersona: (id) =>
    set((state) => {
      // Built-in personas have IDs starting with `builtin_` — guard
      // against accidental delete via this action. The Personas pane
      // already hides the delete button on built-ins, but a defensive
      // check here makes the contract explicit and prevents misuse from
      // any future caller.
      if (id.startsWith('builtin_')) return state
      const nextCustoms = state.customPersonas.filter((p) => p.id !== id)
      if (nextCustoms.length === state.customPersonas.length) return state
      return {
        customPersonas: nextCustoms,
        personas: mergeAndSort(nextCustoms),
      }
    }),
})
