import type { ReactNode } from 'react'
import { NavSidebar } from '@/features/sidebar'
import { MosaicLayout } from '@/features/windows'
import { SharedInputBar } from '@/features/input'
import { QueueSidebar } from '@/features/queueSidebar'

/**
 * Three-column dashboard layout.
 *
 * Column 1 (20%): Navigation sidebar — keys, sessions
 * Column 2 (flex): Unified context window — chat + input
 * Column 3 (224px): Advisor panel — turn controls + advisor list
 *
 * During transition, Column 2 still uses MosaicLayout and Column 3
 * uses QueueSidebar. These will be replaced in Phases 3 and 4.
 */
export function AppLayout(): ReactNode {
  return (
    <div className="flex h-screen bg-surface-base">
      {/* Column 1: Navigation Sidebar */}
      <div className="w-1/5 min-w-[200px] max-w-[280px] shrink-0">
        <NavSidebar />
      </div>

      {/* Column 2: Main Content (chat + input) */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-hidden">
          <MosaicLayout />
        </div>
        <footer className="shrink-0 border-t border-edge-subtle p-3">
          <SharedInputBar />
        </footer>
      </div>

      {/* Column 3: Advisor Panel (QueueSidebar placeholder) */}
      <div className="w-56 shrink-0">
        <QueueSidebar />
      </div>
    </div>
  )
}
