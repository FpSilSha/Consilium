import { type ReactNode, useState } from 'react'
import { MosaicLayout, AddAdvisorButton } from '@/features/windows'
import { SharedInputBar } from '@/features/input'
import { QueueSidebar } from '@/features/queueSidebar'
import { MainThreadCompactButton } from '@/features/compaction'
import { CallForVoteButton } from '@/features/voting'
import { ExportButton } from '@/features/export'
import { BudgetBar } from '@/features/budget'
import { OnboardingWizard } from '@/features/onboarding'
import { KeyManager } from '@/features/keys'
import { useStore } from '@/store'

export function App(): ReactNode {
  const uiMode = useStore((s) => s.uiMode)
  const setUIMode = useStore((s) => s.setUIMode)
  const keysLoaded = useStore((s) => s.keysLoaded)
  const keys = useStore((s) => s.keys)
  const windowCount = useStore((s) => s.windowOrder.length)
  const clearAllWindows = useStore((s) => s.clearAllWindows)
  const archiveMessages = useStore((s) => s.archiveMessages)
  const messages = useStore((s) => s.messages)
  const setMessages = useStore((s) => s.setMessages)

  const [onboardingComplete, setOnboardingComplete] = useState(false)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [showKeyManager, setShowKeyManager] = useState(false)

  // Set to true to force-show onboarding wizard for testing
  const FORCE_ONBOARDING = false

  // Show onboarding wizard on first launch (no keys configured) or when forced
  const showOnboarding = FORCE_ONBOARDING || (keysLoaded && keys.length === 0 && !onboardingComplete)

  if (showOnboarding) {
    return <OnboardingWizard onComplete={() => setOnboardingComplete(true)} />
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-gray-800 px-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-400">Consilium</span>
          <BudgetBar />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowKeyManager(true)}
            className="rounded border border-gray-700 px-2 py-0.5 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-200"
            title="Manage API keys"
          >
            Keys{keys.length > 0 ? ` (${keys.length})` : ''}
          </button>
          <ExportButton />
          <CallForVoteButton />
          <MainThreadCompactButton />
          <button
            onClick={() => setUIMode(uiMode === 'gui' ? 'terminal' : 'gui')}
            className="rounded border border-gray-700 px-2 py-0.5 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-200"
          >
            {uiMode === 'gui' ? 'GUI' : 'TRM'}
          </button>
          {windowCount >= 2 && (
            <button
              onClick={() => setConfirmClearAll(true)}
              className="rounded border border-red-900 px-2 py-0.5 text-xs text-red-400 hover:border-red-700 hover:text-red-300"
              title="Remove all advisors"
            >
              Clear All
            </button>
          )}
          <AddAdvisorButton />
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <MosaicLayout />
        </div>
        <QueueSidebar />
      </main>

      <footer className="shrink-0 border-t border-gray-800 p-3">
        <SharedInputBar />
      </footer>

      {/* Key Manager modal */}
      {showKeyManager && <KeyManager onClose={() => setShowKeyManager(false)} />}

      {/* Clear All confirmation modal */}
      {confirmClearAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 max-w-md rounded-lg border border-red-800 bg-gray-900 p-6">
            <h3 className="text-sm font-medium text-red-400">Remove all advisors?</h3>
            <p className="mt-2 text-xs text-gray-400">
              This will remove all {windowCount} advisor windows, clear the queue, and end the current conversation.
              Messages will be archived but all advisor state will be lost.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Consider exporting the session first if you want to keep a record.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmClearAll(false)}
                className="rounded bg-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Archive active messages before clearing
                  if (messages.length > 0) {
                    archiveMessages([...messages])
                    setMessages([])
                  }
                  clearAllWindows()
                  setConfirmClearAll(false)
                }}
                className="rounded bg-red-700 px-3 py-1.5 text-xs text-white hover:bg-red-600"
              >
                Remove All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
