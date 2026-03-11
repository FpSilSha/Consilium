import type { ReactNode } from 'react'
import { MosaicLayout, AddAdvisorButton } from '@/features/windows'
import { SharedInputBar } from '@/features/input'
import { useStore } from '@/store'

export function App(): ReactNode {
  const uiMode = useStore((s) => s.uiMode)
  const setUIMode = useStore((s) => s.setUIMode)

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-gray-800 px-4">
        <span className="text-sm font-medium text-gray-400">Consilium</span>
        <div className="flex items-center gap-3">
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
        <MosaicLayout />
      </main>

      <footer className="shrink-0 border-t border-gray-800 p-3">
        <SharedInputBar />
      </footer>
    </div>
  )
}
