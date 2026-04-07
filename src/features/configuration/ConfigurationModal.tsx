import { type ReactNode, useState, useCallback, useEffect, useRef } from 'react'
import { PANES_BY_GROUP, GROUP_LABELS, DEFAULT_PANE, getPane, type PaneId, type PaneDef } from './panes'

/**
 * Unified Configuration modal — replaces the per-feature settings modals
 * (Compile Settings, Auto-compaction Settings, Edit Configuration) with a
 * single sidebar-tabbed dialog and adds new panes for the persona and
 * prompt libraries being introduced in this refactor.
 *
 * Layout (VS Code Settings style):
 *
 *   ┌──────────────────────────────────────────────┐
 *   │  Configuration                          [X]  │
 *   ├───────────────┬──────────────────────────────┤
 *   │ LIBRARIES     │                              │
 *   │   Personas    │     <selected pane body>     │
 *   │   System...   │                              │
 *   │   ...         │                              │
 *   │ SETTINGS      │                              │
 *   │   Compile     │                              │
 *   │   ...         │                              │
 *   │ INTEGRATIONS  │                              │
 *   │   Adapters    │                              │
 *   │   API Keys    │                              │
 *   └───────────────┴──────────────────────────────┘
 *
 * Save semantics:
 *   - Each pane manages its own dirty state and renders its own save
 *     button. There is NO global save at the bottom of the modal. This
 *     matches how each pane maps to a different store slice / disk file
 *     and avoids the "I changed three things in three tabs and lost track
 *     of what I was saving" problem.
 *
 * Pane lifecycle:
 *   - Panes start as 'placeholder' (library not yet built) or 'legacy'
 *     (real implementation lives in a standalone modal we haven't ported
 *     yet). Both render simple notices in this shell. As the rollout
 *     proceeds, panes graduate to 'native' and gain real components.
 *   - 'link-out' panes (Adapters, API Keys) are permanently external
 *     for v1 and tracked in OPEN_ADDITIONS.md for the post-launch port.
 *
 * The shell does NOT render the legacy modals itself. When the user
 * clicks an "Open …" button on a legacy/link-out pane, the modal closes
 * and the parent (AppLayout) opens the corresponding standalone modal
 * via the callbacks passed in props. This avoids modal-on-modal UX and
 * keeps state ownership clean — AppLayout already owns those modals'
 * open/close state.
 */

interface ConfigurationModalProps {
  readonly onClose: () => void
  readonly onOpenCompileSettings: () => void
  readonly onOpenAutoCompactSettings: () => void
  readonly onOpenAdvanced: () => void
  readonly onOpenAdaptersAndKeys: () => void
}

export function ConfigurationModal({
  onClose,
  onOpenCompileSettings,
  onOpenAutoCompactSettings,
  onOpenAdvanced,
  onOpenAdaptersAndKeys,
}: ConfigurationModalProps): ReactNode {
  const [activePaneId, setActivePaneId] = useState<PaneId>(DEFAULT_PANE)
  const dialogRef = useRef<HTMLDivElement>(null)

  const activePane = getPane(activePaneId)

  // Escape key closes the modal. Attached to the OUTER dialog div so it
  // fires regardless of which child element has focus, including the
  // backdrop itself.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      // Minimal focus trap: when the user tabs past the last focusable
      // element, wrap to the first; when shift-tabbing past the first,
      // wrap to the last. Without this, Tab escapes the modal into the
      // hidden app behind the backdrop, which violates the aria-modal
      // contract for keyboard users (screen readers honour the attribute
      // but the DOM does not enforce a trap on its own).
      if (e.key !== 'Tab') return
      const root = dialogRef.current
      if (root == null) return
      const focusable = root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    },
    [onClose],
  )

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="config-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        className="mx-4 flex h-[80vh] max-h-[760px] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-edge-subtle bg-surface-panel"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-edge-subtle px-6 py-4">
          <h2
            id="config-modal-title"
            className="text-sm font-semibold text-content-primary"
          >
            Configuration
          </h2>
          <button
            onClick={onClose}
            autoFocus
            aria-label="Close configuration"
            className="rounded-md px-3 py-1 text-xs text-content-muted transition-colors hover:bg-surface-hover hover:text-content-primary"
          >
            Close
          </button>
        </div>

        {/* Body: sidebar + pane */}
        <div className="flex min-h-0 flex-1">
          {/* Sidebar */}
          <nav
            aria-label="Configuration panes"
            className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-edge-subtle bg-surface-base/40 py-3"
          >
            {(['libraries', 'settings', 'integrations'] as const).map((group) => (
              <div key={group} className="mb-3">
                <p className="px-4 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-content-disabled">
                  {GROUP_LABELS[group]}
                </p>
                {PANES_BY_GROUP[group].map((pane) => {
                  const isActive = pane.id === activePaneId
                  // Status suffix for screen readers: visually shown as a
                  // small badge or arrow, but those nodes are aria-hidden
                  // so AT relies on the suffix text on the button label.
                  const statusSuffix =
                    pane.kind === 'placeholder'
                      ? ' (coming soon)'
                      : pane.kind === 'legacy' || pane.kind === 'link-out'
                        ? ' (opens external editor)'
                        : ''
                  return (
                    <button
                      key={pane.id}
                      onClick={() => setActivePaneId(pane.id)}
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={`${pane.label}${statusSuffix}`}
                      className={`flex w-full items-center justify-between px-4 py-1.5 text-left text-xs transition-colors ${
                        isActive
                          ? 'bg-accent-blue/15 text-content-primary'
                          : 'text-content-muted hover:bg-surface-hover hover:text-content-primary'
                      }`}
                    >
                      <span aria-hidden="true">{pane.label}</span>
                      {pane.kind === 'placeholder' && (
                        <span
                          aria-hidden="true"
                          className="ml-2 rounded bg-surface-hover px-1.5 py-0 text-[9px] uppercase tracking-wider text-content-disabled"
                        >
                          soon
                        </span>
                      )}
                      {(pane.kind === 'legacy' || pane.kind === 'link-out') && (
                        <span aria-hidden="true" className="ml-2 text-[10px] text-content-disabled">
                          ↗
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>

          {/* Pane body */}
          <div className="min-w-0 flex-1 overflow-y-auto">
            <PaneBody
              pane={activePane}
              onClose={onClose}
              onOpenCompileSettings={onOpenCompileSettings}
              onOpenAutoCompactSettings={onOpenAutoCompactSettings}
              onOpenAdvanced={onOpenAdvanced}
              onOpenAdaptersAndKeys={onOpenAdaptersAndKeys}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Pane body dispatch
// ─────────────────────────────────────────────────────────────────────────

interface PaneBodyProps {
  readonly pane: PaneDef
  readonly onClose: () => void
  readonly onOpenCompileSettings: () => void
  readonly onOpenAutoCompactSettings: () => void
  readonly onOpenAdvanced: () => void
  readonly onOpenAdaptersAndKeys: () => void
}

function PaneBody({
  pane,
  onClose,
  onOpenCompileSettings,
  onOpenAutoCompactSettings,
  onOpenAdvanced,
  onOpenAdaptersAndKeys,
}: PaneBodyProps): ReactNode {
  // Native panes (when they exist) get a dedicated component each. For now
  // every pane is either 'placeholder' or 'legacy'/'link-out', so the
  // shell renders the same two helpers for all of them.
  if (pane.kind === 'placeholder') {
    return <PlaceholderPane pane={pane} />
  }

  // Legacy and link-out panes both render an "Open …" button that opens
  // the legacy modal and then closes the configuration modal. The
  // callbacks are wired in AppLayout, which already owns each legacy
  // modal's open/close state.
  //
  // Open-then-close order matters: with React 18 batching, both state
  // updates flush in the same commit, but the open MUST be enqueued
  // first so the legacy modal's state is true before the unmount path
  // for ConfigurationModal runs. The reverse order would briefly leave
  // an effect on the unmount path observing the new modal as still
  // closed, which is the kind of race we don't want lurking.
  const handleOpen = (): void => {
    switch (pane.id) {
      case 'compile-settings':
        onOpenCompileSettings()
        break
      case 'auto-compact-settings':
        onOpenAutoCompactSettings()
        break
      case 'advanced':
        onOpenAdvanced()
        break
      case 'adapters':
      case 'api-keys':
        onOpenAdaptersAndKeys()
        break
      default: {
        // Exhaustiveness guard. If a future pane id slips through with
        // kind 'legacy' or 'link-out' but is not handled in the switch,
        // surface it loudly in dev rather than silently no-op'ing.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _exhaustive: never = pane.id as never
        console.error(`[configuration] LegacyPane handleOpen has no case for pane id "${pane.id}"`)
        break
      }
    }
    onClose()
  }

  const buttonLabel = pane.kind === 'legacy' ? `Open ${pane.label} settings` : `Open ${pane.label}`

  return <LegacyPane pane={pane} buttonLabel={buttonLabel} onOpen={handleOpen} />
}

// ─────────────────────────────────────────────────────────────────────────
// Placeholder pane — used while a library is still being built
// ─────────────────────────────────────────────────────────────────────────

function PlaceholderPane({ pane }: { readonly pane: PaneDef }): ReactNode {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-edge-subtle px-6 py-4">
        <h3 className="text-sm font-semibold text-content-primary">{pane.label}</h3>
      </div>
      <div className="flex flex-1 flex-col items-start gap-3 px-6 py-6">
        <span className="rounded bg-surface-hover px-2 py-0.5 text-[10px] uppercase tracking-wider text-content-muted">
          Coming soon
        </span>
        <p className="max-w-xl text-xs leading-relaxed text-content-muted">{pane.blurb}</p>
        <p className="max-w-xl text-xs italic text-content-disabled">
          This pane is being built. The rest of the application is unaffected — settings
          and personas continue to work as before until this library lands.
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Legacy / link-out pane — explainer + button that opens an external modal
// ─────────────────────────────────────────────────────────────────────────

function LegacyPane({
  pane,
  buttonLabel,
  onOpen,
}: {
  readonly pane: PaneDef
  readonly buttonLabel: string
  readonly onOpen: () => void
}): ReactNode {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-edge-subtle px-6 py-4">
        <h3 className="text-sm font-semibold text-content-primary">{pane.label}</h3>
      </div>
      <div className="flex flex-1 flex-col items-start gap-4 px-6 py-6">
        <p className="max-w-xl text-xs leading-relaxed text-content-muted">{pane.blurb}</p>
        {pane.kind === 'legacy' && (
          <p className="max-w-xl text-xs italic text-content-disabled">
            Opens in its current dedicated window for now. This pane will be ported into the
            Configuration modal in a follow-up change.
          </p>
        )}
        {pane.kind === 'link-out' && (
          <p className="max-w-xl text-xs italic text-content-disabled">
            Opens the dedicated editor. See OPEN_ADDITIONS for the post-launch plan to bring
            this pane inline with the others.
          </p>
        )}
        <button
          onClick={onOpen}
          className="rounded-md bg-accent-blue px-4 py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-blue/90"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Keyboard shortcut hook — exported so AppLayout can wire Ctrl+, globally
// without ConfigurationModal needing to be mounted just to listen.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Subscribes to Ctrl+, / Cmd+, while the component using this hook is
 * mounted. The handler fires the supplied `onOpen` callback. The hook is
 * intentionally narrow — no debouncing, no preventDefault for non-matching
 * keys — so it can sit alongside the existing Ctrl+K command palette
 * listener without interfering.
 */
export function useConfigurationShortcut(onOpen: () => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        onOpen()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onOpen])
}
