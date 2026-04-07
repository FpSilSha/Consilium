import { createContext, useContext } from 'react'

/**
 * Pane-switch dirty guard plumbing for ConfigurationModal.
 *
 * Lives in its own module — separate from `ConfigurationModal.tsx` —
 * so that native panes (Personas, System Prompts, etc.) can import
 * `useRegisterDirtyGuard` without creating a circular module
 * dependency:
 *
 *   PersonasPane → @/features/configuration → ConfigurationModal → PersonasPane
 *
 * By placing the context here, native panes import from
 * `@/features/configuration/dirty-guard` directly. The
 * `ConfigurationModal` provider also imports from this file, so the
 * dependency graph is one-way:
 *
 *   ConfigurationModal → dirty-guard
 *   PersonasPane       → dirty-guard
 *
 * No cycle. ESLint's `import/no-cycle` rule (and any future module
 * graph inspection) stays happy.
 *
 * Pattern (used by every native pane that has unsaved-edit state):
 *
 *   const register = useRegisterDirtyGuard()
 *   const isDirtyRef = useRef(isDirty)
 *   isDirtyRef.current = isDirty
 *   useEffect(() => {
 *     register(() => {
 *       if (!isDirtyRef.current) return true
 *       return window.confirm('Discard unsaved changes?')
 *     })
 *     return () => register(null)
 *   }, [register])
 */

/**
 * Returns true if the current pane allows the switch to proceed
 * (e.g., no unsaved edits, or the user confirmed discard). Returning
 * false aborts the pending pane switch.
 */
export type DirtyGuard = () => boolean

export type SetDirtyGuard = (guard: DirtyGuard | null) => void

export const DirtyGuardContext = createContext<SetDirtyGuard>(() => {
  // No-op outside ConfigurationModal — calling this from a stray
  // descendant should not crash but should not silently appear to work
  // either, hence the dev warning.
  if (typeof process !== 'undefined' && process.env?.['NODE_ENV'] !== 'production') {
    console.warn('[configuration] useRegisterDirtyGuard called outside ConfigurationModal')
  }
})

/**
 * Hook for native panes to register a dirty-state check. Pass a function
 * that returns `true` if it is safe to switch panes (e.g., no unsaved
 * edits, or the user confirmed discard) and `false` to block the switch.
 *
 * Call with `null` (or rely on unmount cleanup) to deregister.
 */
export function useRegisterDirtyGuard(): SetDirtyGuard {
  return useContext(DirtyGuardContext)
}
