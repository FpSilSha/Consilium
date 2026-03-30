import { type ReactNode, useCallback } from 'react'
import { useStore } from '@/store'
import { createDefaultAdvisorWindow } from '@/features/windows/advisor-factory'
import { TurnControls } from './TurnControls'
import { AdvisorListItem } from './AdvisorListItem'
import { QueueList } from './QueueList'
import { CallForVoteButton } from '@/features/voting'
import { ExportButton } from '@/features/export'

export function AdvisorPanel(): ReactNode {
  const windowOrder = useStore((s) => s.windowOrder)
  const windows = useStore((s) => s.windows)
  const addWindow = useStore((s) => s.addWindow)
  const personas = useStore((s) => s.personas)
  const keys = useStore((s) => s.keys)

  const handleAddAdvisor = useCallback(() => {
    const newWindow = createDefaultAdvisorWindow(windowOrder, personas, keys)
    addWindow(newWindow)
  }, [windowOrder, personas, keys, addWindow])

  return (
    <aside className="flex h-full w-full flex-col border-l border-edge-subtle bg-surface-panel">
      {/* Turn mode + controls */}
      <TurnControls />

      {/* Add advisor + actions */}
      <div className="flex items-center gap-2 border-b border-edge-subtle px-3 py-2">
        <button
          onClick={handleAddAdvisor}
          className="flex-1 rounded-md bg-accent-blue py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-blue/90"
        >
          + Add Advisor
        </button>
        <CallForVoteButton />
        <ExportButton />
      </div>

      {/* Two sections: Advisors (who's in session) + Queue (turn order) */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Advisors */}
        <div className="shrink-0 border-b border-edge-subtle">
          <h2 className="px-3 pt-3 text-xs font-medium uppercase tracking-wider text-content-muted">
            Advisors ({windowOrder.length})
          </h2>
          <div className="mt-1 max-h-48 overflow-y-auto px-1 pb-2">
            {windowOrder.length === 0 ? (
              <p className="px-3 py-3 text-xs text-content-disabled">
                No advisors yet. Add one above.
              </p>
            ) : (
              windowOrder.map((id) => {
                const advisor = windows[id]
                if (advisor == null) return null
                return <AdvisorListItem key={id} advisor={advisor} />
              })
            )}
          </div>
        </div>

        {/* Queue */}
        <div className="flex min-h-0 flex-1 flex-col">
          <h2 className="px-3 pt-3 text-xs font-medium uppercase tracking-wider text-content-muted">
            Queue
          </h2>
          <div className="mt-1 flex-1 overflow-y-auto">
            <QueueList />
          </div>
        </div>
      </div>
    </aside>
  )
}
