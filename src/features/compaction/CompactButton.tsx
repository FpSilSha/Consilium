import { type ReactNode, useCallback, useState } from 'react'
import { useStore } from '@/store'
import { Tooltip } from '@/features/ui/Tooltip'
import { compactWindow } from './compaction-service'
import { getContextUsagePercent } from './compaction-engine'

interface CompactButtonProps {
  readonly windowId: string
}

export function CompactButton({ windowId }: CompactButtonProps): ReactNode {
  const [isCompacting, setIsCompacting] = useState(false)
  const window = useStore((s) => s.windows[windowId])
  const messages = useStore((s) => s.messages)

  const usagePercent = window !== undefined
    ? getContextUsagePercent(messages, window.model)
    : 0

  const handleCompact = useCallback(async () => {
    setIsCompacting(true)
    try {
      await compactWindow(windowId)
    } finally {
      setIsCompacting(false)
    }
  }, [windowId])

  if (window === undefined) return null

  const isHigh = usagePercent >= 60

  return (
    <div className="flex items-center gap-1.5">
      {/* Context usage indicator */}
      <Tooltip text="Context window usage — compact when high" position="bottom">
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-8 rounded-full bg-surface-hover">
          <div
            className={`h-full rounded-full transition-all ${
              usagePercent >= 80
                ? 'bg-red-500'
                : usagePercent >= 60
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(usagePercent, 100)}%` }}
          />
        </div>
        <span className="text-xs text-content-disabled">{Math.round(usagePercent)}%</span>
        </div>
      </Tooltip>

      {/* Compaction indicator */}
      {window.isCompacted && (
        <Tooltip text="Working from summarized history" position="bottom">
          <span className="text-xs text-purple-400">C</span>
        </Tooltip>
      )}

      {/* Compact Now button — only show when there are messages to compact */}
      {isHigh && usagePercent > 0 && (
        <button
          onClick={handleCompact}
          disabled={isCompacting || window.isStreaming}
          className="rounded px-1.5 py-0.5 text-xs text-content-disabled hover:bg-surface-hover hover:text-content-primary disabled:opacity-40"
        >
          {isCompacting ? '...' : 'Compact'}
        </button>
      )}
    </div>
  )
}
