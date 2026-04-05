import type { ReactNode } from 'react'
import type { Persona } from '@/types'
import { MarkdownContent } from '@/features/chat/MarkdownContent'

interface PersonaPreviewProps {
  readonly persona: Persona
  readonly onClose: () => void
}

export function PersonaPreview({ persona, onClose }: PersonaPreviewProps): ReactNode {
  return (
    <div className="mb-2 rounded-md border border-edge-subtle bg-surface-panel">
      <div className="flex items-center justify-between border-b border-edge-subtle px-2.5 py-1.5">
        <span className="text-[10px] font-medium text-content-primary">{persona.name}</span>
        <button
          onClick={onClose}
          className="text-[10px] text-content-disabled transition-colors hover:text-content-muted"
        >
          Close
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto px-2.5 py-2 text-xs text-content-muted">
        <MarkdownContent content={persona.content} />
      </div>
    </div>
  )
}
