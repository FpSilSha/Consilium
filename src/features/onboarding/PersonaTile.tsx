import { type ReactNode, useState } from 'react'
import type { Persona } from '@/types'
import { MarkdownContent } from '@/features/chat/MarkdownContent'

interface PersonaTileProps {
  readonly persona: Persona
  readonly isSelected: boolean
  readonly onClick: () => void
}

export function PersonaTile({ persona, isSelected, onClick }: PersonaTileProps): ReactNode {
  const [expanded, setExpanded] = useState(false)

  // Extract first meaningful line of content as description
  const description = persona.content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '' && !line.startsWith('#'))
    ?? ''

  return (
    <div className="flex flex-col">
      <div className={`rounded-lg border px-3 py-2.5 transition-colors ${
        isSelected
          ? 'border-accent-blue bg-accent-blue/15 text-content-primary'
          : 'border-edge-subtle bg-surface-panel text-content-muted hover:border-edge-focus hover:bg-surface-hover'
      }`}>
        <div className="flex items-center justify-between">
          <button
            onClick={onClick}
            aria-pressed={isSelected}
            className="text-left text-xs font-medium"
          >
            {persona.name}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-content-disabled transition-colors hover:text-content-muted"
          >
            {expanded ? 'Hide' : 'Preview'}
          </button>
        </div>
        {description !== '' && !expanded && (
          <button
            onClick={onClick}
            className="mt-0.5 line-clamp-2 text-left text-[10px] text-content-disabled"
          >
            {description}
          </button>
        )}
      </div>
      {expanded && (
        <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-edge-subtle bg-surface-base px-2.5 py-2 text-xs text-content-muted">
          <MarkdownContent content={persona.content} />
        </div>
      )}
    </div>
  )
}
