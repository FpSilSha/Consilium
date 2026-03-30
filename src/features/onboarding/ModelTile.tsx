import type { ReactNode } from 'react'
import type { ModelInfo } from '@/types'

interface ModelTileProps {
  readonly model: ModelInfo
  readonly isSelected: boolean
  readonly onClick: () => void
}

export function ModelTile({ model, isSelected, onClick }: ModelTileProps): ReactNode {
  return (
    <button
      onClick={onClick}
      aria-pressed={isSelected}
      className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
        isSelected
          ? 'border-accent-blue bg-accent-blue/15 text-content-primary'
          : 'border-edge-subtle bg-surface-panel text-content-muted hover:border-edge-focus hover:bg-surface-hover'
      }`}
    >
      <div className="text-xs font-medium">{model.name}</div>
      <div className="mt-0.5 text-[10px] text-content-disabled">
        {model.provider} · {Math.round(model.contextWindow / 1000)}K ctx
      </div>
    </button>
  )
}
