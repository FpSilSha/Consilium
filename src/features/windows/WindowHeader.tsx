import type { ReactNode } from 'react'
import type { AdvisorWindow } from '@/types'
import { CompactButton } from '@/features/compaction'

interface WindowHeaderProps {
  readonly window: AdvisorWindow
  readonly onClose: () => void
}

export function WindowHeader({ window: win, onClose }: WindowHeaderProps): ReactNode {
  return (
    <div
      className="flex h-9 shrink-0 items-center justify-between border-b border-gray-800 px-3"
      style={{ borderTopColor: win.accentColor, borderTopWidth: 2 }}
    >
      <div className="flex items-center gap-2 overflow-hidden">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: win.accentColor }}
        />
        <span className="truncate text-xs font-medium text-gray-300">
          {win.personaLabel}
        </span>
        <span className="truncate text-xs text-gray-500">
          {win.model}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <CompactButton windowId={win.id} />
        <span className="text-xs text-gray-500">
          ~${win.runningCost.toFixed(4)}
        </span>
        {win.isStreaming && (
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
        )}
        <button
          onClick={onClose}
          className="ml-1 flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-700 hover:text-gray-300"
          title="Remove advisor"
        >
          x
        </button>
      </div>
    </div>
  )
}
