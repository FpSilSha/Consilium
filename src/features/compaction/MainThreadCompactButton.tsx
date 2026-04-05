import { type ReactNode, useCallback, useState } from 'react'
import { useStore } from '@/store'
import { Tooltip } from '@/features/ui/Tooltip'
import { compactMainThread } from './compaction-service'

export function MainThreadCompactButton(): ReactNode {
  const [showWarning, setShowWarning] = useState(false)
  const [isCompacting, setIsCompacting] = useState(false)
  const [skipWarning, setSkipWarning] = useState(false)
  const messageCount = useStore((s) => s.messages.length)

  const handleClick = useCallback(() => {
    if (skipWarning) {
      performCompaction()
    } else {
      setShowWarning(true)
    }
  }, [skipWarning])

  const performCompaction = useCallback(async () => {
    setShowWarning(false)
    setIsCompacting(true)
    try {
      await compactMainThread()
    } finally {
      setIsCompacting(false)
    }
  }, [])

  if (messageCount < 10) return null

  return (
    <>
      <Tooltip text="Summarize conversation to free context space" position="bottom">
        <button
          onClick={handleClick}
          disabled={isCompacting}
          className="rounded border border-edge-subtle px-2 py-0.5 text-xs text-content-muted hover:border-edge-focus hover:text-content-primary disabled:opacity-40"
        >
          {isCompacting ? 'Compacting...' : 'Compact Thread'}
        </button>
      </Tooltip>

      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 max-w-md rounded-lg border border-edge-subtle bg-surface-base p-5">
            <h3 className="mb-2 text-sm font-medium text-content-primary">
              Compact Conversation History?
            </h3>
            <p className="mb-4 text-xs text-content-muted">
              This will summarize the conversation history. All agents will work
              from the summarized version going forward. The full original is
              preserved in your session file.
            </p>
            <label className="mb-4 flex items-center gap-2 text-xs text-content-disabled">
              <input
                type="checkbox"
                checked={skipWarning}
                onChange={(e) => setSkipWarning(e.target.checked)}
                className="rounded border-edge-subtle"
              />
              Don&apos;t show this warning again
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowWarning(false)}
                className="rounded px-3 py-1.5 text-xs text-content-muted hover:bg-surface-panel"
              >
                Cancel
              </button>
              <button
                onClick={performCompaction}
                className="rounded bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500"
              >
                Compact
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
