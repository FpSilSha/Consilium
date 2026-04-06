import { type ReactNode, useCallback, useState } from 'react'
import { useStore } from '@/store'
import { Tooltip } from '@/features/ui/Tooltip'
import { getModelById } from '@/features/modelSelector/model-registry'

/**
 * Toggle + model picker for automatic context compaction.
 *
 * Off by default. When the user enables it and picks a model, future turns
 * will trigger an LLM-summarized compaction the moment any advisor crosses
 * 65% of its model's context window. The smallest-context advisor effectively
 * drives the trigger because compaction shrinks the shared message bus.
 *
 * Same warning as manual compaction: cost is real, summary quality varies by
 * model, and the choice replaces messages in the chat with a summary.
 */
export function AutoCompactButton(): ReactNode {
  const [showPicker, setShowPicker] = useState(false)
  const enabled = useStore((s) => s.autoCompactionEnabled)
  const config = useStore((s) => s.autoCompactionConfig)
  const setAutoCompaction = useStore((s) => s.setAutoCompaction)
  const windowOrder = useStore((s) => s.windowOrder)
  const windows = useStore((s) => s.windows)
  const orModels = useStore((s) => s.catalogModels['openrouter']) ?? []

  const handleSelect = useCallback((provider: string, model: string, keyId: string) => {
    setAutoCompaction(true, { provider, model, keyId })
    setShowPicker(false)
  }, [setAutoCompaction])

  const handleDisable = useCallback(() => {
    setAutoCompaction(false, null)
    setShowPicker(false)
  }, [setAutoCompaction])

  // Resolve a friendly label for the currently selected model, if any.
  const selectedLabel = enabled && config != null
    ? (getModelById(config.model, orModels)?.name ?? config.model.split('/').pop() ?? 'Auto')
    : 'Off'

  return (
    <div className="relative">
      <Tooltip
        text={enabled
          ? 'Auto-compaction is ON — older messages will be summarized when context fills up'
          : 'Turn on auto-compaction to summarize older messages automatically'}
        position="top"
      >
        <button
          onClick={() => setShowPicker((v) => !v)}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
            enabled
              ? 'bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30'
              : 'bg-surface-hover text-content-muted hover:bg-surface-active hover:text-content-primary'
          }`}
        >
          <span>Auto-compact: {selectedLabel}</span>
        </button>
      </Tooltip>

      {showPicker && (
        <div className="absolute bottom-full left-0 z-40 mb-1 w-72 rounded-md border border-edge-subtle bg-surface-panel p-2 shadow-lg">
          <p className="mb-1.5 text-[10px] text-content-disabled">
            Choose a model to summarize older messages automatically when context fills up:
          </p>
          <p className="mb-2 rounded bg-yellow-900/20 px-2 py-1 text-[10px] text-yellow-400">
            Sends conversation history to the selected model whenever auto-compaction fires. Cheaper models may produce a less accurate summary. Cost tracked under &quot;System&quot;.
          </p>

          {/* Off entry — disables auto-compaction */}
          <button
            onClick={handleDisable}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-surface-hover ${
              !enabled ? 'bg-surface-hover text-content-primary' : 'text-content-muted'
            }`}
          >
            <div className="h-2.5 w-2.5 rounded-full bg-content-disabled" />
            <span>Off</span>
            {!enabled && <span className="ml-auto text-[10px] text-accent-blue">✓</span>}
          </button>

          {/* Active advisors */}
          {windowOrder.length > 0 && (
            <>
              <p className="mb-1 mt-1.5 text-[10px] font-medium text-content-disabled">Active Advisors</p>
              {windowOrder.map((id) => {
                const win = windows[id]
                if (win == null) return null
                const isSelected = enabled && config?.keyId === win.keyId && config?.model === win.model
                return (
                  <button
                    key={id}
                    onClick={() => handleSelect(win.provider, win.model, win.keyId)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-surface-hover ${
                      isSelected ? 'bg-surface-hover text-content-primary' : 'text-content-primary'
                    }`}
                  >
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: win.accentColor }} />
                    <span className="truncate">{win.personaLabel}</span>
                    <span className="ml-auto truncate text-[10px] text-content-disabled">{win.model.split('/').pop()}</span>
                    {isSelected && <span className="text-[10px] text-accent-blue">✓</span>}
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
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
