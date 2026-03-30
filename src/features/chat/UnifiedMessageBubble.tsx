import type { ReactNode } from 'react'
import type { Message } from '@/types'
import { useStore } from '@/store'
import { getModelById } from '@/features/modelSelector/model-registry'

interface UnifiedMessageBubbleProps {
  readonly message: Message
}

export function UnifiedMessageBubble({ message }: UnifiedMessageBubbleProps): ReactNode {
  const isUser = message.role === 'user'

  // Subscribe to stable fields only — accentColor and model don't change during streaming
  const accentColor = useStore((s) => s.windows[message.windowId]?.accentColor) ?? '#9BA8B5'
  const model = useStore((s) => s.windows[message.windowId]?.model)
  const openRouterModels = useStore((s) => s.openRouterModels)

  const modelName = model != null
    ? (getModelById(model, openRouterModels)?.name ?? model)
    : undefined

  if (isUser) {
    return (
      <div className="flex justify-end px-4 py-2">
        <div className="max-w-[70%] rounded-lg bg-accent-blue/20 px-4 py-2.5 text-sm text-content-primary">
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start gap-3 px-4 py-2">
      <div
        className="mt-1 h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: accentColor }}
      />

      <div className="min-w-0 max-w-[80%]">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-xs font-semibold" style={{ color: accentColor }}>
            {message.personaLabel}
          </span>
          {modelName != null && (
            <span className="text-xs text-content-muted">
              {modelName}
            </span>
          )}
        </div>

        <div className="rounded-lg bg-surface-panel px-3 py-2.5 text-sm text-content-primary">
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
          {message.costMetadata != null && (
            <div className="mt-1.5 text-right text-xs text-content-muted">
              ~${message.costMetadata.estimatedCost.toFixed(4)}
              {message.costMetadata.isEstimate ? ' (est)' : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
