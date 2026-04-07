import { type ReactNode, useState, useCallback } from 'react'
import { useStore } from '@/store'
import { NavButton } from './NavButton'
import { SessionHistoryList } from './SessionHistoryList'
import { ErrorLog } from './ErrorLog'
import { BudgetBar } from '@/features/budget'
import { saveCurrentSession, initializeNewSession } from '@/features/sessions/session-manager'
import { stopAll } from '@/features/turnManager'

export function NavSidebar(): ReactNode {
  const windowCount = useStore((s) => s.windowOrder.length)
  const messageCount = useStore((s) => s.messages.length)
  const setConfigModalOpen = useStore((s) => s.setConfigModalOpen)

  const [confirmNewSession, setConfirmNewSession] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const handleNewConsilium = useCallback(() => {
    if (windowCount === 0 && messageCount === 0) {
      setToastMessage('This is already a new session!')
      setTimeout(() => setToastMessage(null), 2500)
      return
    }
    setConfirmNewSession(true)
  }, [windowCount, messageCount])

  const executeNewConsilium = useCallback(async () => {
    // stopAll tears down advisor turns AND the compile stream (centralized
    // via abortActiveCompile inside stopAll).
    stopAll()
    // Save current session before clearing
    await saveCurrentSession().catch(() => {})
    const { clearMessages, clearAllWindows } = useStore.getState()
    clearMessages()
    clearAllWindows()
    useStore.getState().setCurrentSessionId(null)
    useStore.getState().setSessionCustomName(null)
    setConfirmNewSession(false)
    await initializeNewSession()
  }, [])

  return (
    <aside className="flex h-full w-full flex-col border-r border-edge-subtle bg-surface-panel">
      {/* Header: cost + budget */}
      <div className="flex flex-col border-b border-edge-subtle px-4 py-3">
        <BudgetBar />
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 px-2 py-3">
        <NavButton
          icon={<SettingsIcon />}
          label="Models & Keys"
          onClick={() => setConfigModalOpen(true)}
        />
      </nav>

      {/* New Consilium CTA */}
      <div className="px-3">
        <button
          onClick={handleNewConsilium}
          className="w-full rounded-lg bg-accent-blue py-2 text-sm font-medium text-content-inverse transition-colors hover:bg-accent-blue/90"
        >
          + New Consilium
        </button>
        {toastMessage != null && (
          <div className="mt-1.5 rounded-md bg-surface-hover px-3 py-1.5 text-center text-[10px] text-content-muted animate-pulse">
            {toastMessage}
          </div>
        )}
      </div>

      {/* Session history — max ~6 items before scroll */}
      <div className="mt-4 shrink-0">
        <h3 className="px-4 text-xs font-medium uppercase tracking-wider text-content-muted">
          Sessions
        </h3>
        <div className="mt-2 max-h-52 overflow-y-auto">
          <SessionHistoryList />
        </div>
      </div>

      {/* Error log — fills remaining space */}
      <div className="min-h-0 flex-1">
        <ErrorLog />
      </div>

      {/* New session confirmation */}
      {confirmNewSession && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-session-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onKeyDown={(e) => { if (e.key === 'Escape') setConfirmNewSession(false) }}
        >
          <div className="mx-4 max-w-md rounded-lg border border-edge-subtle bg-surface-panel p-6">
            <h3 id="new-session-title" className="text-sm font-medium text-content-primary">
              Start new session?
            </h3>
            <p className="mt-2 text-xs text-content-muted">
              This will archive {messageCount} messages and remove {windowCount} advisors.
              You can restore this session later.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmNewSession(false)}
                className="rounded bg-surface-hover px-3 py-1.5 text-xs text-content-muted hover:bg-surface-active"
              >
                Cancel
              </button>
              <button
                onClick={executeNewConsilium}
                className="rounded bg-accent-blue px-3 py-1.5 text-xs font-medium text-content-inverse hover:bg-accent-blue/90"
                autoFocus
              >
                New Session
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

function SettingsIcon(): ReactNode {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
    </svg>
  )
}
