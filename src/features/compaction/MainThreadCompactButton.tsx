import { type ReactNode, useCallback, useState } from 'react'
import { useStore } from '@/store'
import { Tooltip } from '@/features/ui/Tooltip'
import { compactMainThread, MANUAL_COMPACTION_BUFFER } from './compaction-service'
import { getRawKey } from '@/features/keys/key-vault'

export function MainThreadCompactButton(): ReactNode {
  const [showPicker, setShowPicker] = useState(false)
  const [isCompacting, setIsCompacting] = useState(false)
  const [resultMessage, setResultMessage] = useState<string | null>(null)
  const messageCount = useStore((s) => s.messages.length)
  const windowOrder = useStore((s) => s.windowOrder)
  const windows = useStore((s) => s.windows)
  const keys = useStore((s) => s.keys)

  const handleCompact = useCallback(async (provider: string, model: string, keyId: string) => {
    const apiKey = getRawKey(keyId)
    if (apiKey == null) return

    setShowPicker(false)
    setIsCompacting(true)
    setResultMessage(null)
    try {
      const result = await compactMainThread(provider, model, apiKey)
      if (result == null) {
        setResultMessage('Nothing to compact')
      } else {
        setResultMessage(`Compacted ${result.archivedCount} message${result.archivedCount === 1 ? '' : 's'}`)
      }
    } catch {
      setResultMessage('Compaction failed')
    } finally {
      setIsCompacting(false)
      setTimeout(() => setResultMessage(null), 4000)
    }
  }, [])

  // Hide until there's actually something to archive. Manual compaction keeps
  // MANUAL_COMPACTION_BUFFER messages verbatim, so we need at least one more
  // than that for the action to do anything.
  if (messageCount <= MANUAL_COMPACTION_BUFFER) return null

  return (
    <div className="relative">
      <Tooltip text="Summarize older messages to free context space" position="top">
        <button
          onClick={() => setShowPicker((v) => !v)}
          disabled={isCompacting}
          className="flex items-center gap-1.5 rounded-md bg-surface-hover px-2.5 py-1 text-xs text-content-muted transition-colors hover:bg-surface-active hover:text-content-primary disabled:opacity-70"
        >
          {isCompacting && (
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
              <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          )}
          {isCompacting ? 'Compacting…' : 'Compact Thread'}
        </button>
      </Tooltip>

      {resultMessage != null && !isCompacting && (
        <div className="absolute bottom-full left-0 z-30 mb-1 whitespace-nowrap rounded-md border border-edge-subtle bg-surface-panel px-2 py-1 text-[10px] text-content-muted shadow-sm">
          {resultMessage}
        </div>
      )}

      {showPicker && (
        <div className="absolute bottom-full left-0 z-40 mb-1 w-64 rounded-md border border-edge-subtle bg-surface-panel p-2 shadow-lg">
          <p className="mb-1.5 text-[10px] text-content-disabled">
            Choose a model to summarize older messages:
          </p>
          <p className="mb-2 rounded bg-yellow-900/20 px-2 py-1 text-[10px] text-yellow-400">
            Sends conversation history to the selected model. Cheaper models may produce a less accurate summary. Cost tracked under &quot;System&quot;.
          </p>

          {/* Active advisors */}
          {windowOrder.length > 0 && (
            <>
              <p className="mb-1 text-[10px] font-medium text-content-disabled">Active Advisors</p>
              {windowOrder.map((id) => {
                const win = windows[id]
                if (win == null) return null
                return (
                  <button
                    key={id}
                    onClick={() => handleCompact(win.provider, win.model, win.keyId)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-content-primary transition-colors hover:bg-surface-hover"
                  >
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: win.accentColor }} />
                    <span className="truncate">{win.personaLabel}</span>
                    <span className="ml-auto truncate text-[10px] text-content-disabled">{win.model.split('/').pop()}</span>
                  </button>
                )
              })}
            </>
          )}

          <div className="mt-1.5 flex justify-end">
            <button
              onClick={() => setShowPicker(false)}
              className="rounded-md px-2 py-1 text-[10px] text-content-disabled hover:text-content-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
