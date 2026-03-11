import { type ReactNode, useState } from 'react'
import { MosaicLayout, AddAdvisorButton } from '@/features/windows'
import { SharedInputBar } from '@/features/input'
import { QueueSidebar } from '@/features/queueSidebar'
import { MainThreadCompactButton } from '@/features/compaction'
import { CallForVoteButton } from '@/features/voting'
import { ExportButton } from '@/features/export'
import { BudgetBar } from '@/features/budget'
import { OnboardingWizard } from '@/features/onboarding'
import { useStore } from '@/store'

export function App(): ReactNode {
  const uiMode = useStore((s) => s.uiMode)
  const setUIMode = useStore((s) => s.setUIMode)
  const keysLoaded = useStore((s) => s.keysLoaded)
  const keys = useStore((s) => s.keys)

  const [onboardingComplete, setOnboardingComplete] = useState(false)

  // Show onboarding wizard on first launch (no keys configured)
  const showOnboarding = keysLoaded && keys.length === 0 && !onboardingComplete

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
          <ExportButton />
          <CallForVoteButton />
          <MainThreadCompactButton />
          <button
            onClick={() => setUIMode(uiMode === 'gui' ? 'terminal' : 'gui')}
            className="rounded border border-gray-700 px-2 py-0.5 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-200"
          >
            {uiMode === 'gui' ? 'GUI' : 'TRM'}
          </button>
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
    </div>
  )
}
