import type { ReactNode } from 'react'
import { MosaicLayout, AddAdvisorButton } from '@/features/windows'

export function App(): ReactNode {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-gray-800 px-4">
        <span className="text-sm font-medium text-gray-400">Consilium</span>
        <AddAdvisorButton />
      </header>

      <main className="flex flex-1 overflow-hidden">
        <MosaicLayout />
      </main>

      {/* Shared input bar — Phase 3C fills this */}
      <footer className="shrink-0 border-t border-gray-800 p-3">
        <div className="flex h-10 items-center rounded-lg border border-gray-700 bg-gray-900 px-4 text-sm text-gray-500">
          Shared input bar (Phase 3C)
        </div>
      </footer>
    </div>
  )
}
