import type { ReactNode } from 'react'
import type { Message } from '@/types'
import { useStore } from '@/store'
import { getModelById } from '@/features/modelSelector/model-registry'
import { MarkdownContent } from './MarkdownContent'

interface UnifiedMessageBubbleProps {
  readonly message: Message
}

export function UnifiedMessageBubble({ message }: UnifiedMessageBubbleProps): ReactNode {
  const isUser = message.role === 'user'

  const accentColor = useStore((s) => s.windows[message.windowId]?.accentColor) ?? '#4A90D9'
  const model = useStore((s) => s.windows[message.windowId]?.model)
  const orModels = useStore((s) => s.catalogModels['openrouter']) ?? []

  const modelName = model != null
    ? (getModelById(model, orModels)?.name ?? model)
    : undefined

  if (isUser) {
    return (
      <div className="flex justify-end px-4 py-2">
        <div className="max-w-[70%] rounded-lg bg-accent-blue/20 px-4 py-2.5 text-sm text-content-primary">
          <div className="break-words">
            <MarkdownContent content={message.content} />
          </div>
        </div>
      </div>
    )
  }

  const cost = message.costMetadata

  // Strip identity header prefix that LLMs sometimes echo back
  // e.g. "[Security Engineer]: Okay." → "Okay."
  const displayContent = stripIdentityHeader(message.content, message.personaLabel)

  return (
    <div className="flex justify-start gap-3 px-4 py-2">
      <div
        className="mt-1 h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: accentColor }}
      />

      <div className="min-w-0 max-w-[80%]">
        {/* Header: persona name */}
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-xs font-semibold" style={{ color: accentColor }}>
            {message.personaLabel}
          </span>
        </div>

        {/* Message body */}
        <div className="rounded-lg bg-surface-panel px-3 py-2.5 text-sm text-content-primary">
          <div className="break-words">
            <MarkdownContent content={displayContent} />
          </div>
        </div>

        {/* API call info bar */}
        <div className="mt-1 flex items-center gap-2 text-[10px] text-content-disabled">
          {modelName != null && (
            <span>{modelName}</span>
          )}
          {cost != null && (
            <>
              {cost.inputTokens > 0 && (
                <span>{cost.inputTokens.toLocaleString()} in</span>
              )}
              {cost.outputTokens > 0 && (
                <span>{cost.outputTokens.toLocaleString()} out</span>
              )}
              <span>
                ~${cost.estimatedCost.toFixed(4)}
                {cost.isEstimate ? ' est' : ''}
              </span>
            </>
          )}
          {cost == null && message.role === 'assistant' && (
            <span className="text-content-disabled italic">unable to track cost</span>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Strips identity header prefix that LLMs sometimes echo back.
 * e.g. "[Security Engineer]: Okay." → "Okay."
 * Also handles "[You]: ..." for user messages echoed by agents.
 */
function stripIdentityHeader(content: string, personaLabel: string): string {
  // Trim leading whitespace first, then check for prefix
  const trimmed = content.trimStart()

  const prefix = `[${personaLabel}]: `
  if (trimmed.startsWith(prefix)) {
    return trimmed.slice(prefix.length)
  }
  // Generic pattern: [AnyLabel]: at the start
  const match = trimmed.match(/^\[[\w\s'-]+\]:\s*/)
  if (match != null) {
    return trimmed.slice(match[0].length)
  }
  return content
}
