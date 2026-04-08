import { type ReactNode, useState, useCallback, useEffect } from 'react'
import { NavSidebar } from '@/features/sidebar'
import { UnifiedChatThread } from '@/features/chat/UnifiedChatThread'
import { SharedInputBar } from '@/features/input'
import { AdvisorPanel } from '@/features/advisorPanel'
import { ConfigModal } from '@/features/modelCatalog/ConfigModal'
import { ModelMismatchModal } from '@/features/sessions/ModelMismatchModal'
import { AboutModal } from '@/features/settings/AboutModal'
import { ConfigurationModal, useConfigurationShortcut } from '@/features/configuration'
import { KeyEncryptionWarning } from '@/features/keys/KeyEncryptionWarning'
import { TitleBar } from './TitleBar'
import { useStore } from '@/store'
import { saveCurrentSession, initializeNewSession } from '@/features/sessions/session-manager'
import { useStartupCatalogFetch } from './useStartupCatalogFetch'
import { useStartupAutoCompaction } from './useStartupAutoCompaction'
import { useStartupCustomPersonas } from './useStartupCustomPersonas'
import { useStartupCustomSystemPrompts } from './useStartupCustomSystemPrompts'
import { useStartupCustomCompilePrompts } from './useStartupCustomCompilePrompts'
import { useStartupCustomCompactPrompts } from './useStartupCustomCompactPrompts'
import { useSessionAutoSave } from './useSessionAutoSave'
import { CommandPalette } from '@/features/commandPalette'
import { WelcomeTourDialog } from '@/features/onboarding/WelcomeTourDialog'

export function AppLayout(): ReactNode {
  useStartupCatalogFetch()
  useStartupAutoCompaction()
  useStartupCustomPersonas()
  useStartupCustomSystemPrompts()
  useStartupCustomCompilePrompts()
  useStartupCustomCompactPrompts()
  useSessionAutoSave()

  const configModalOpen = useStore((s) => s.configModalOpen)
  const setConfigModalOpen = useStore((s) => s.setConfigModalOpen)
  const pendingMismatches = useStore((s) => s.pendingMismatches)
  const setPendingMismatches = useStore((s) => s.setPendingMismatches)

  // All settings modals have been ported into native ConfigurationModal
  // panes (tasks #23 + #25). The only modals AppLayout owns now are
  // standalone overlays (About, Welcome Tour, ConfigModal for
  // model-catalog/adapters/keys, ModelMismatchModal, CommandPalette).
  const [showAbout, setShowAbout] = useState(false)
  const [showWelcomeTour, setShowWelcomeTour] = useState(false)
  const [showConfiguration, setShowConfiguration] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  // Ctrl+, opens the modal. If already open, the shortcut is a no-op
  // rather than a toggle — toggling would let the user accidentally
  // close the modal mid-edit by retriggering the hotkey, and the
  // explicit Close button + Escape key already cover the close path.
  // No legacy-modal mutex needed anymore — every settings modal is a
  // native pane inside ConfigurationModal as of task #25.
  const openConfiguration = useCallback(() => {
    setShowConfiguration((prev) => (prev ? prev : true))
  }, [])
  // Adapters and API Keys are exposed in the Configuration sidebar as
  // link-out tiles for v1. Both currently live inside the same
  // model-catalog ConfigModal (which already handles providers, custom
  // providers, keys, and the adapter builder), so a single callback is
  // enough — see OPEN_ADDITIONS for the post-launch port plan that gives
  // each its own dedicated pane.
  const openAdaptersAndKeys = useCallback(() => setConfigModalOpen(true), [setConfigModalOpen])

  // Defined BEFORE handleMenuAction so handleMenuAction's dependency
  // array can reference it without a TDZ-style stale-closure trap.
  // Previously this useCallback lived after handleMenuAction with both
  // having empty deps; that worked only because both happened to be
  // stable, and would have silently broken the moment either added a
  // store dependency.
  const handleNewConsilium = useCallback(async () => {
    // Close ConfigurationModal before starting a fresh session.
    // Without this, the modal would stay open layered on top of an
    // empty session, with stale draft state from the prior session
    // still typed into any open pane forms.
    setShowConfiguration(false)

    // Tear down in-flight streams (advisor turns AND compile) before clearing
    // state. stopAll handles both via its centralized abortActiveCompile call.
    const { stopAll } = await import('@/features/turnManager')
    stopAll()

    await saveCurrentSession().catch(() => {})
    const { clearMessages, clearAllWindows, setCurrentSessionId, setSessionCustomName } = useStore.getState()
    clearMessages()
    clearAllWindows()
    setCurrentSessionId(null)
    setSessionCustomName(null)
    await initializeNewSession()
  }, [])

  const handleMenuAction = useCallback((action: string) => {
    switch (action) {
      case 'menu:new-consilium':
        handleNewConsilium()
        break
      case 'menu:configuration':
        // Route through openConfiguration so the legacy-modal mutex
        // applies whether the modal is opened from the title bar, the
        // Ctrl+, hotkey, or the Electron main-process menu.
        openConfiguration()
        break
      // All legacy settings menu actions ('menu:compile-settings',
      // 'menu:auto-compaction-settings', 'menu:edit-config') were
      // removed in tasks #23 and #25 when their panes became native
      // inside ConfigurationModal. Both the renderer-side switch
      // cases AND the preload allowlist entries are gone now. The
      // only Edit menu entry that remains is 'menu:configuration'.
      case 'menu:welcome-tour':
        setShowWelcomeTour(true)
        break
      case 'menu:about':
        setShowAbout(true)
        break
    }
  }, [handleNewConsilium, openConfiguration])

  // Ctrl+, / Cmd+, opens the unified Configuration modal — same shortcut
  // as VS Code Settings, intentional muscle-memory match.
  useConfigurationShortcut(openConfiguration)

  // Initialize a new session on first load if none exists
  useEffect(() => {
    initializeNewSession().catch(() => {})
  }, [])

  // Subscribe to keyboard shortcut menu actions from the Electron main process
  useEffect(() => {
    const api = (window as { consiliumAPI?: { onMenuAction: (cb: (action: string) => void) => () => void } }).consiliumAPI
    if (api == null) return
    return api.onMenuAction(handleMenuAction)
  }, [handleMenuAction])

  // Prevent file drag-and-drop from navigating the window (handled by SharedInputBar)
  useEffect(() => {
    const preventNav = (e: DragEvent) => { e.preventDefault() }
    document.addEventListener('dragover', preventNav)
    document.addEventListener('drop', preventNav)
    return () => {
      document.removeEventListener('dragover', preventNav)
      document.removeEventListener('drop', preventNav)
    }
  }, [])

  // Command palette keyboard shortcut (Ctrl+K / Cmd+K)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex h-screen flex-col bg-surface-base">
      {/* Custom title bar */}
      <TitleBar onMenuAction={handleMenuAction} />

      {/* OS key-encryption warning — visible only when safeStorage
          is unavailable on the host (typically Linux without
          gnome-keyring/libsecret/kwallet installed). The banner is
          intentionally non-dismissible because the underlying issue
          is functional: the app cannot save API keys until it's
          fixed. Hidden by default; the keys-loaded check inside
          the component prevents a startup flash. */}
      <KeyEncryptionWarning />

      {/* Main content */}
      <div className="flex min-h-0 flex-1">
        {/* Column 1: Navigation Sidebar */}
        <div className="w-1/5 min-w-[200px] max-w-[280px] shrink-0">
          <NavSidebar />
        </div>

        {/* Column 2: Main Content (chat + input) */}
        <main className="flex min-w-0 flex-1 flex-col">
          <UnifiedChatThread />
          <footer className="shrink-0 border-t border-edge-subtle p-3">
            <SharedInputBar />
          </footer>
        </main>

        {/* Column 3: Advisor Panel */}
        <div className="w-1/4 min-w-[220px] max-w-[320px] shrink-0">
          <AdvisorPanel />
        </div>
      </div>

      {/* Modals */}
      {configModalOpen && (
        <ConfigModal onClose={() => setConfigModalOpen(false)} />
      )}
      {pendingMismatches.length > 0 && (
        <ModelMismatchModal
          mismatches={pendingMismatches}
          onResolved={() => setPendingMismatches([])}
        />
      )}
      {showAbout && (
        <AboutModal onClose={() => setShowAbout(false)} />
      )}
      {showWelcomeTour && (
        <WelcomeTourDialog onClose={() => setShowWelcomeTour(false)} />
      )}
      {showConfiguration && (
        <ConfigurationModal
          onClose={() => setShowConfiguration(false)}
          onOpenAdaptersAndKeys={openAdaptersAndKeys}
        />
      )}
      {commandPaletteOpen && (
        <CommandPalette onClose={() => setCommandPaletteOpen(false)} />
      )}
    </div>
  )
}
