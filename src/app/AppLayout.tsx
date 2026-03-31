import type { ReactNode } from 'react'
import { NavSidebar } from '@/features/sidebar'
import { UnifiedChatThread } from '@/features/chat/UnifiedChatThread'
import { SharedInputBar } from '@/features/input'
import { AdvisorPanel } from '@/features/advisorPanel'
import { ConfigModal } from '@/features/modelCatalog/ConfigModal'
import { useStore } from '@/store'
import { useStartupCatalogFetch } from './useStartupCatalogFetch'

/**
 * Three-column dashboard layout.
 *
 * Column 1 (20%): Navigation sidebar — models & keys, sessions
 * Column 2 (flex): Unified context window — chat + input
 * Column 3 (25%): Advisor panel — turn controls + advisor list
 */
export function AppLayout(): ReactNode {
  useStartupCatalogFetch()

  const configModalOpen = useStore((s) => s.configModalOpen)
  const setConfigModalOpen = useStore((s) => s.setConfigModalOpen)

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

      {/* Column 3: Advisor Panel */}
      <div className="w-1/4 min-w-[220px] max-w-[320px] shrink-0">
        <AdvisorPanel />
      </div>

      {/* Config Modal */}
      {configModalOpen && (
        <ConfigModal onClose={() => setConfigModalOpen(false)} />
      )}
    </div>
  )
}
