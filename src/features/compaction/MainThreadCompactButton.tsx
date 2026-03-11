import { type ReactNode, useCallback, useState } from 'react'
import { useStore } from '@/store'
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
      <button
        onClick={handleClick}
        disabled={isCompacting}
        className="rounded border border-gray-700 px-2 py-0.5 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-200 disabled:opacity-40"
        title="Compact main conversation thread"
      >
        {isCompacting ? 'Compacting...' : 'Compact Thread'}
      </button>

      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 max-w-md rounded-lg border border-gray-700 bg-gray-900 p-5">
            <h3 className="mb-2 text-sm font-medium text-gray-200">
              Compact Conversation History?
            </h3>
            <p className="mb-4 text-xs text-gray-400">
              This will summarize the conversation history. All agents will work
              from the summarized version going forward. The full original is
              preserved in your session file.
            </p>
            <label className="mb-4 flex items-center gap-2 text-xs text-gray-500">
              <input
                type="checkbox"
                checked={skipWarning}
                onChange={(e) => setSkipWarning(e.target.checked)}
                className="rounded border-gray-600"
              />
              Don&apos;t show this warning again
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowWarning(false)}
                className="rounded px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-800"
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
