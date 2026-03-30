import type { ReactNode } from 'react'
import type { AdvisorWindow } from '@/types'
import { useStore } from '@/store'
import { getModelById } from '@/features/modelSelector/model-registry'

interface AdvisorListItemProps {
  readonly advisor: AdvisorWindow
}

export function AdvisorListItem({ advisor }: AdvisorListItemProps): ReactNode {
  const removeWindow = useStore((s) => s.removeWindow)
  const openRouterModels = useStore((s) => s.openRouterModels)

  const modelName = getModelById(advisor.model, openRouterModels)?.name ?? advisor.model

  return (
    <div className="group flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-surface-hover">
      {/* Color dot + streaming indicator */}
      <div className="relative shrink-0">
        <div
          className={`h-3 w-3 rounded-full ${advisor.isStreaming ? 'animate-pulse' : ''}`}
          style={{ backgroundColor: advisor.accentColor }}
        />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-content-primary">
          {advisor.personaLabel}
        </div>
        <div className="truncate text-xs text-content-muted">
          {modelName}
        </div>
        {advisor.runningCost > 0 && (
          <div className="text-xs text-content-disabled">
            ~${advisor.runningCost.toFixed(4)}
          </div>
        )}
      </div>

      {/* Status badges */}
      <div className="flex shrink-0 items-center gap-1">
        {advisor.isStreaming && (
          <span className="text-xs text-accent-green">typing</span>
        )}
        {advisor.error != null && (
          <span className="text-xs text-error" title={advisor.error}>err</span>
        )}
      </div>

      {/* Remove button (visible on hover) */}
      <button
        onClick={() => removeWindow(advisor.id)}
        className="shrink-0 rounded p-0.5 text-xs text-content-disabled opacity-0 transition-opacity hover:text-accent-red group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
        title="Remove advisor"
      >
        ✕
      </button>
    </div>
  )
}
