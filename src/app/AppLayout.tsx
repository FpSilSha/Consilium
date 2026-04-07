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
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  const handleMenuAction = useCallback((action: string) => {
    switch (action) {
      case 'menu:new-consilium':
        handleNewConsilium()
        break
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

  const handleNewConsilium = useCallback(async () => {
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
      {commandPaletteOpen && (
        <CommandPalette onClose={() => setCommandPaletteOpen(false)} />
      )}
    </div>
  )
}
