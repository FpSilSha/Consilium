import type { ReactNode } from 'react'
import { NavSidebar } from '@/features/sidebar'
import { UnifiedChatThread } from '@/features/chat/UnifiedChatThread'
import { SharedInputBar } from '@/features/input'
import { QueueSidebar } from '@/features/queueSidebar'

/**
 * Three-column dashboard layout.
 *
 * Column 1 (20%): Navigation sidebar — keys, sessions
 * Column 2 (flex): Unified context window — chat + input
 * Column 3 (224px): Advisor panel — turn controls + advisor list
 *
 * Column 2 now uses UnifiedChatThread (single interleaved thread).
 * Column 3 still uses QueueSidebar — will be replaced in Phase 4.
 */
export function AppLayout(): ReactNode {
  return (
    <div className="flex h-screen bg-surface-base">
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

      {/* Column 3: Advisor Panel (QueueSidebar placeholder) */}
      <div className="w-56 shrink-0">
        <QueueSidebar />
      </div>
    </div>
  )
}
