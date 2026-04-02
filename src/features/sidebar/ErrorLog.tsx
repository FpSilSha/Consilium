import type { ReactNode } from 'react'
import { useStore } from '@/store'

export function ErrorLog(): ReactNode {
  const errorLog = useStore((s) => s.errorLog)
  const clearErrorLog = useStore((s) => s.clearErrorLog)

  if (errorLog.length === 0) return null

  return (
    <div className="flex flex-col border-t border-edge-subtle">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <h3 className="text-xs font-medium uppercase tracking-wider text-error">
          Errors ({errorLog.length})
        </h3>
        <button
          onClick={clearErrorLog}
          className="text-[10px] text-content-disabled transition-colors hover:text-content-muted"
        >
          Clear
        </button>
      </div>
      <div className="max-h-40 overflow-y-auto px-2 pb-2">
        {errorLog.map((entry) => (
          <div key={entry.id} className="mt-1 rounded-md bg-surface-base px-2.5 py-1.5">
            <div className="flex items-center gap-1.5">
              <div
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: entry.accentColor }}
              />
              <span className="text-[10px] font-medium text-content-primary">
                {entry.advisorLabel}
              </span>
              <span className="text-[10px] text-content-disabled">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-error">{entry.message}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
