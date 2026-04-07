import { type ReactNode, useState, useCallback, useEffect } from 'react'
import { NavSidebar } from '@/features/sidebar'
import { UnifiedChatThread } from '@/features/chat/UnifiedChatThread'
import { SharedInputBar } from '@/features/input'
import { AdvisorPanel } from '@/features/advisorPanel'
import { ConfigModal } from '@/features/modelCatalog/ConfigModal'
import { ModelMismatchModal } from '@/features/sessions/ModelMismatchModal'
import { EditConfigModal } from '@/features/settings/EditConfigModal'
import { AutoCompactionSettingsModal } from '@/features/settings/AutoCompactionSettingsModal'
import { CompileSettingsModal } from '@/features/settings/CompileSettingsModal'
import { AboutModal } from '@/features/settings/AboutModal'
import { ConfigurationModal, useConfigurationShortcut } from '@/features/configuration'
import { TitleBar } from './TitleBar'
import { useStore } from '@/store'
import { saveCurrentSession, initializeNewSession } from '@/features/sessions/session-manager'
import { useStartupCatalogFetch } from './useStartupCatalogFetch'
import { useStartupAutoCompaction } from './useStartupAutoCompaction'
import { useSessionAutoSave } from './useSessionAutoSave'
import { CommandPalette } from '@/features/commandPalette'
import { WelcomeTourDialog } from '@/features/onboarding/WelcomeTourDialog'

export function AppLayout(): ReactNode {
  useStartupCatalogFetch()
  useStartupAutoCompaction()
  useSessionAutoSave()

  const configModalOpen = useStore((s) => s.configModalOpen)
  const setConfigModalOpen = useStore((s) => s.setConfigModalOpen)
  const pendingMismatches = useStore((s) => s.pendingMismatches)
  const setPendingMismatches = useStore((s) => s.setPendingMismatches)

  const [showEditConfig, setShowEditConfig] = useState(false)
  const [showAutoCompactSettings, setShowAutoCompactSettings] = useState(false)
  const [showCompileSettings, setShowCompileSettings] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showWelcomeTour, setShowWelcomeTour] = useState(false)
  const [showConfiguration, setShowConfiguration] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  // Ctrl+, opens the modal. If already open, the shortcut is a no-op
  // rather than a toggle — toggling would let the user accidentally
  // close the modal mid-edit by retriggering the hotkey, and the
  // explicit Close button + Escape key already cover the close path.
  // Using the functional setter form so this callback never closes
  // over a stale `showConfiguration` value (it has no dependency on
  // state, so it's stable across renders).
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

  const handleMenuAction = useCallback((action: string) => {
    switch (action) {
      case 'menu:new-consilium':
        handleNewConsilium()
        break
      case 'menu:configuration':
        setShowConfiguration(true)
        break
      // Legacy menu actions remain wired so the keyboard shortcuts and
      // existing IPC menu emissions from the Electron main process
      // continue to function during the rollout. Once all panes are
      // ported (tasks #23, #25), the IPC menu definitions in the main
      // process will be collapsed to a single Configuration entry too.
      case 'menu:edit-config':
        setShowEditConfig(true)
        break
      case 'menu:auto-compaction-settings':
        setShowAutoCompactSettings(true)
        break
      case 'menu:compile-settings':
        setShowCompileSettings(true)
        break
      case 'menu:welcome-tour':
        setShowWelcomeTour(true)
        break
      case 'menu:about':
        setShowAbout(true)
        break
    }
  }, [])

  // Ctrl+, / Cmd+, opens the unified Configuration modal — same shortcut
  // as VS Code Settings, intentional muscle-memory match.
  useConfigurationShortcut(openConfiguration)

  const handleNewConsilium = useCallback(async () => {
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
      {showEditConfig && (
        <EditConfigModal onClose={() => setShowEditConfig(false)} />
      )}
      {showAutoCompactSettings && (
        <AutoCompactionSettingsModal onClose={() => setShowAutoCompactSettings(false)} />
      )}
      {showCompileSettings && (
        <CompileSettingsModal onClose={() => setShowCompileSettings(false)} />
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
          onOpenCompileSettings={() => setShowCompileSettings(true)}
          onOpenAutoCompactSettings={() => setShowAutoCompactSettings(true)}
          onOpenAdvanced={() => setShowEditConfig(true)}
          onOpenAdaptersAndKeys={openAdaptersAndKeys}
        />
      )}
      {commandPaletteOpen && (
        <CommandPalette onClose={() => setCommandPaletteOpen(false)} />
      )}
    </div>
  )
}
