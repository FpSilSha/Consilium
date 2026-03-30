import type { ReactNode } from 'react'
import type { Persona } from '@/types'

interface PersonaTileProps {
  readonly persona: Persona
  readonly isSelected: boolean
  readonly onClick: () => void
}

export function PersonaTile({ persona, isSelected, onClick }: PersonaTileProps): ReactNode {
  // Extract first meaningful line of content as description
  const description = persona.content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '' && !line.startsWith('#'))
    ?? ''

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
      <div className="text-xs font-medium">{persona.name}</div>
      {description !== '' && (
        <div className="mt-0.5 line-clamp-2 text-[10px] text-content-disabled">
          {description}
        </div>
      )}
    </button>
  )
}
