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

  const handleAddAdvisor = useCallback(async () => {
    const newWindow = await createDefaultAdvisorWindow(windowOrder, personas, keys)
    addWindow(newWindow)
  }, [windowOrder, personas, keys, addWindow])

  return (
    <aside className="flex h-full w-full flex-col border-l border-edge-subtle bg-surface-panel">
      {/* ── Advisors section (top) ──────────────── */}
      <div className="shrink-0 border-b border-edge-subtle">
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          <h2 className="text-xs font-medium uppercase tracking-wider text-content-muted">
            Advisors ({windowOrder.length})
          </h2>
          <div className="flex items-center gap-1.5">
            <CallForVoteButton />
            <ExportButton />
          </div>
        </div>

        {/* Add advisor pill */}
        <div className="px-3 pb-2">
          <button
            onClick={handleAddAdvisor}
            className="w-full rounded-full border border-edge-subtle bg-surface-base py-1.5 text-xs font-medium text-content-muted transition-colors hover:border-accent-blue hover:text-accent-blue"
          >
            + Add Advisor
          </button>
        </div>

        {/* Advisor list */}
        <div className="max-h-56 overflow-y-auto px-1 pb-2">
          {windowOrder.length === 0 ? (
            <p className="px-3 py-3 text-xs text-content-disabled">
              {keys.length === 0
                ? 'Configure API keys first via Models & Keys.'
                : 'No advisors yet. Click "+ Add Advisor" above.'}
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

      {/* ── Queue section (bottom) ─────────────── */}
      <div className="flex min-h-0 flex-1 flex-col">
        <h2 className="px-3 pt-3 pb-1 text-xs font-medium uppercase tracking-wider text-content-muted">
          Queue
        </h2>

        {/* Turn mode + Start/Stop moved here */}
        <TurnControls />

        {/* Queue cards */}
        <div className="flex-1 overflow-y-auto">
          <QueueList />
        </div>
      </div>
    </aside>
  )
}
