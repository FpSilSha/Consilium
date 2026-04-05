import { type ReactNode, useState, useCallback } from 'react'
import type { Message } from '@/types'
import { useStore } from '@/store'
import { Tooltip } from '@/features/ui/Tooltip'
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
          {message.attachments != null && message.attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {message.attachments.map((att) => (
                att.type === 'image' ? (
                  <img
                    key={att.id}
                    src={`data:${att.mimeType};base64,${att.data}`}
                    alt={att.name}
                    className="max-h-48 max-w-full rounded-md"
                  />
                ) : (
                  <span key={att.id} className="rounded bg-surface-active px-2 py-0.5 text-xs text-content-muted">
                    📄 {att.name}
                  </span>
                )
              ))}
            </div>
          )}
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

  // Detect if message is "document-like" — long with markdown headings
  const isDocumentLike = displayContent.length > 500 && /^#{1,3}\s/m.test(displayContent)

  return (
    <AssistantBubble
      message={message}
      displayContent={displayContent}
      accentColor={accentColor}
      modelName={modelName}
      isDocumentLike={isDocumentLike}
    />
  )
}

function AssistantBubble({ message, displayContent, accentColor, modelName, isDocumentLike }: {
  readonly message: Message
  readonly displayContent: string
  readonly accentColor: string
  readonly modelName: string | undefined
  readonly isDocumentLike: boolean
}): ReactNode {
  const [documentView, setDocumentView] = useState(false)
  const cost = message.costMetadata

  const handleExport = useCallback(async () => {
    const api = (window as { consiliumAPI?: { saveFileDialog: (name: string, content: string) => Promise<boolean> } }).consiliumAPI
    if (api == null) return
    const filename = `${message.personaLabel.toLowerCase().replace(/\s+/g, '-')}-${new Date(message.timestamp).toISOString().slice(0, 10)}.md`
    await api.saveFileDialog(filename, displayContent)
  }, [message.personaLabel, message.timestamp, displayContent])

  // Full-width document view
  if (documentView) {
    return (
      <div className="px-4 py-2">
        <div className="rounded-lg border border-edge-subtle bg-surface-panel">
          {/* Document header */}
          <div className="flex items-center justify-between border-b border-edge-subtle px-4 py-2">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: accentColor }} />
              <span className="text-xs font-semibold" style={{ color: accentColor }}>
                {message.personaLabel}
              </span>
              <span className="text-[10px] text-content-disabled">Document</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExport}
                className="text-[10px] text-content-disabled transition-colors hover:text-accent-blue"
              >
                Export .md
              </button>
              <button
                onClick={() => setDocumentView(false)}
                className="text-[10px] text-content-disabled transition-colors hover:text-content-muted"
              >
                Chat view
              </button>
            </div>
          </div>

          {/* Document body — full width */}
          <div className="prose-sm px-6 py-4 text-sm text-content-primary">
            <MarkdownContent content={displayContent} />
          </div>
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

        {/* API call info bar + actions */}
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
          {/* Action buttons */}
          <span className="text-content-disabled">·</span>
          <button
            onClick={handleExport}
            className="transition-colors hover:text-accent-blue"
          >
            Export .md
          </button>
          {isDocumentLike && (
            <Tooltip text="Expand to full-width document layout" position="top">
              <button
                onClick={() => setDocumentView(true)}
                className="transition-colors hover:text-accent-blue"
              >
                View as Document
              </button>
            </Tooltip>
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
