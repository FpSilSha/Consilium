/**
 * Pane metadata for the unified ConfigurationModal.
 *
 * The modal uses a vertical sidebar grouped into two top-level sections:
 *
 *  - LIBRARIES: editable collections of named things (personas, prompts).
 *    Each library follows the same pattern: base entries shipped in code
 *    (read-only) + custom entries with full CRUD persisted to disk.
 *
 *  - SETTINGS: configuration knobs for specific features (compile,
 *    auto-compaction) plus the raw JSON config editor for power users.
 *
 *  - LINK-OUTS: surfaces that intentionally stay as standalone modals for
 *    v1 (Adapters, API Keys). Tracked here so they appear in the sidebar
 *    with the same visual treatment as native panes, but clicking them
 *    closes the ConfigurationModal and opens the legacy modal. Listed in
 *    OPEN_ADDITIONS.md for the post-launch port.
 *
 * The `kind` field drives how `ConfigurationModal` renders the pane body:
 *
 *  - 'placeholder': pane is not yet built. Renders a "coming soon" notice.
 *    Used during the multi-task rollout while individual library panes are
 *    being constructed in dependency order.
 *
 *  - 'legacy': pane is built but not yet ported into the modal. Renders a
 *    short explainer plus a button that closes the modal and opens the
 *    existing standalone modal. Used for Compile / Auto-compact / Advanced
 *    panes until tasks #23 and #25 port them in.
 *
 *  - 'link-out': permanent v1 link-out (Adapters, API Keys). Functionally
 *    identical to 'legacy' for now — the distinction is purely intent: a
 *    'legacy' pane will be replaced with a real implementation, a
 *    'link-out' pane will not (until OPEN_ADDITIONS work).
 *
 *  - 'native' (future): pane has been built out as a real component
 *    living inside the modal. Not used yet — every pane starts as
 *    'placeholder' or 'legacy' and graduates to 'native' as tasks land.
 *
 * Adding a new pane: append to PANES, give it a stable id, and add a
 * matching case in ConfigurationModal's pane-body switch.
 */

export type PaneId =
  | 'personas'
  | 'system-prompts'
  | 'compile-prompts'
  | 'compact-prompts'
  | 'compile-settings'
  | 'auto-compact-settings'
  | 'advanced'
  | 'adapters'
  | 'api-keys'

export type PaneKind = 'placeholder' | 'legacy' | 'link-out' | 'native'

export type PaneGroup = 'libraries' | 'settings' | 'integrations'

export interface PaneDef {
  readonly id: PaneId
  readonly label: string
  readonly group: PaneGroup
  readonly kind: PaneKind
  /**
   * Short one-line description shown in the empty/placeholder state. Not
   * shown for native panes — those have their own headers.
   */
  readonly blurb: string
}

/**
 * Display order is the order entries appear in this array. Group order is
 * fixed in the sidebar component (libraries → settings → integrations) so
 * grouping does not depend on this array's order, only the within-group
 * order does.
 */
export const PANES: readonly PaneDef[] = [
  {
    id: 'personas',
    label: 'Personas',
    group: 'libraries',
    kind: 'native',
    blurb: 'Create and manage advisor personas. Base personas ship with the app; custom personas are yours to edit and delete.',
  },
  {
    id: 'system-prompts',
    label: 'System Prompts',
    group: 'libraries',
    kind: 'native',
    blurb: 'Customize the base advisor instructions and the persona-switch handoff prompt. Each can be set to base, custom, or off.',
  },
  {
    id: 'compile-prompts',
    label: 'Compile Prompts',
    group: 'libraries',
    kind: 'native',
    blurb: 'The five built-in compile presets become base entries here. Add your own custom compile prompts that appear in the Compile Document dropdown.',
  },
  {
    id: 'compact-prompts',
    label: 'Compact Prompts',
    group: 'libraries',
    kind: 'native',
    blurb: 'Customize the prompt used by manual compact and auto-compaction. Both features pick from the same library.',
  },
  {
    id: 'compile-settings',
    label: 'Compile',
    group: 'settings',
    kind: 'native',
    blurb: 'Default model, max tokens, and default style for compile document.',
  },
  {
    id: 'auto-compact-settings',
    label: 'Auto-compaction',
    group: 'settings',
    kind: 'native',
    blurb: 'Toggle auto-compaction, set the threshold, and pick the model used to summarize archived messages.',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    group: 'settings',
    kind: 'legacy',
    blurb: 'Raw JSON config editor for fields without dedicated UI. Power-user only — fields mirrored in the store are hidden to prevent desync.',
  },
  {
    id: 'adapters',
    label: 'Adapters',
    group: 'integrations',
    kind: 'link-out',
    blurb: 'Custom HTTP adapters for self-hosted or unsupported providers. Opens the dedicated adapter builder.',
  },
  {
    id: 'api-keys',
    label: 'API Keys',
    group: 'integrations',
    kind: 'link-out',
    blurb: 'Provider API keys, custom providers, and per-provider key management. Opens the dedicated keys and providers modal.',
  },
]

export const GROUP_LABELS: Readonly<Record<PaneGroup, string>> = {
  libraries: 'Libraries',
  settings: 'Settings',
  integrations: 'Integrations',
}

/**
 * Default pane shown when the modal opens. Personas is the first library
 * pane and the most-requested feature, so it makes the best landing.
 */
export const DEFAULT_PANE: PaneId = 'personas'

export function getPane(id: PaneId): PaneDef {
  const found = PANES.find((p) => p.id === id)
  if (found == null) {
    // Unreachable while PaneId is exhaustive — defensive fallback so a
    // future rename doesn't crash the modal mid-rollout. Logged loudly so
    // the regression surfaces in dev instead of silently opening on the
    // default pane.
    console.error(`[configuration] getPane called with unknown id "${id}" — falling back to default`)
    return PANES.find((p) => p.id === DEFAULT_PANE) ?? PANES[0]!
  }
  return found
}

/**
 * Pre-grouped pane index. PANES is a frozen module-level constant, so
 * grouping it once at module load is cheaper than recomputing inside a
 * `useMemo` on every render — and it lets the sidebar treat it as a
 * frozen lookup table without re-deriving.
 */
export const PANES_BY_GROUP: Readonly<Record<PaneGroup, readonly PaneDef[]>> = (() => {
  const result: Record<PaneGroup, PaneDef[]> = {
    libraries: [],
    settings: [],
    integrations: [],
  }
  for (const pane of PANES) {
    result[pane.group].push(pane)
  }
  // Freeze the inner arrays so consumers can't mutate them.
  return {
    libraries: Object.freeze(result.libraries),
    settings: Object.freeze(result.settings),
    integrations: Object.freeze(result.integrations),
  }
})()
