import { type ReactNode, useState, useCallback } from 'react'
import { useStore } from '@/store'
import { NavButton } from './NavButton'
import { SessionHistoryList } from './SessionHistoryList'
import { BudgetBar } from '@/features/budget'
import { KeyManager } from '@/features/keys'

type SidebarPanel = 'none' | 'keys'

export function NavSidebar(): ReactNode {
  const windowCount = useStore((s) => s.windowOrder.length)
  const messageCount = useStore((s) => s.messages.length)

  const [activePanel, setActivePanel] = useState<SidebarPanel>('none')
  const [confirmNewSession, setConfirmNewSession] = useState(false)

  const handleNewConsilium = useCallback(() => {
    if (windowCount === 0 && messageCount === 0) return
    setConfirmNewSession(true)
  }, [windowCount, messageCount])

  const executeNewConsilium = useCallback(() => {
    const { messages, archiveMessages, setMessages, clearAllWindows } = useStore.getState()
    if (messages.length > 0) {
      archiveMessages([...messages])
      setMessages([])
    }
    clearAllWindows()
    setConfirmNewSession(false)
  }, [])

  return (
    <aside className="flex h-full w-full flex-col border-r border-edge-subtle bg-surface-panel">
      {/* Header: logo + cost */}
      <div className="flex items-center gap-2 border-b border-edge-subtle px-4 py-3">
        <span className="text-sm font-semibold text-content-primary">Consilium</span>
        <BudgetBar />
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 px-2 py-3">
        <NavButton
          icon={<KeyIcon />}
          label="Keys"
          isActive={activePanel === 'keys'}
          onClick={() => setActivePanel(activePanel === 'keys' ? 'none' : 'keys')}
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
      </div>

      {/* Session history */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <h3 className="px-4 text-xs font-medium uppercase tracking-wider text-content-muted">
          Sessions
        </h3>
        <div className="mt-2 flex-1 overflow-y-auto">
          <SessionHistoryList />
        </div>
      </div>

      {/* Key Manager modal */}
      {activePanel === 'keys' && (
        <KeyManager onClose={() => setActivePanel('none')} />
      )}

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

/** Simple key SVG icon — avoids emoji in source */
function KeyIcon(): ReactNode {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path
        fillRule="evenodd"
        d="M8 7a5 5 0 1 1 3.61 4.804l-1.903 1.903A1 1 0 0 1 9 14H8v1a1 1 0 0 1-1 1H6v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2a1 1 0 0 1 .293-.707L8.196 8.39A5.002 5.002 0 0 1 8 7Zm5-3a.75.75 0 0 0 0 1.5A1.5 1.5 0 0 1 14.5 7 .75.75 0 0 0 16 7a3 3 0 0 0-3-3Z"
        clipRule="evenodd"
      />
    </svg>
  )
}
