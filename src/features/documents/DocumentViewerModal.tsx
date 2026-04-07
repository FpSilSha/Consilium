import { type ReactNode, useCallback } from 'react'
import { useStore } from '@/store'
import { MarkdownContent } from '@/features/chat/MarkdownContent'
import { createUserMessage } from '@/services/context-bus/message-factory'
import type { SessionDocument } from './types'

interface DocumentViewerModalProps {
  readonly document: SessionDocument
  readonly onClose: () => void
}

/**
 * Full-screen viewer for a compiled document. Renders the markdown body
 * with the same MarkdownContent component used for chat bubbles. Provides
 * the same set of actions as the sidebar row, in case the user wants to
 * trigger them while reading.
 */
export function DocumentViewerModal({ document, onClose }: DocumentViewerModalProps): ReactNode {
  const appendMessage = useStore((s) => s.appendMessage)

  const handleAddToChat = useCallback(() => {
    const message = createUserMessage(document.content, '')
    appendMessage(message)
    onClose()
  }, [document, appendMessage, onClose])

  const handleExport = useCallback(async () => {
    const api = (window as { consiliumAPI?: { saveFileDialog: (name: string, content: string) => Promise<boolean> } }).consiliumAPI
    if (api == null) return
    const filename = `${document.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}.md`
    await api.saveFileDialog(filename || 'document.md', document.content)
  }, [document])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="doc-viewer-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="mx-4 flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-edge-subtle bg-surface-panel"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge-subtle px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="doc-viewer-title" className="truncate text-sm font-semibold text-content-primary">
              {document.title}
            </h2>
            <p className="mt-0.5 text-[10px] text-content-disabled">
              {document.modelName}
              {document.cost > 0 && <span> · ~${document.cost.toFixed(4)}</span>}
              {document.focusPrompt != null && <span> · focused</span>}
            </p>
          </div>
          <div className="ml-3 flex items-center gap-2">
            <button
              onClick={handleAddToChat}
              className="rounded-md bg-accent-blue px-3 py-1 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-blue/90"
            >
              Add to chat
            </button>
            <button
              onClick={handleExport}
              className="rounded-md bg-surface-hover px-3 py-1 text-xs text-content-muted transition-colors hover:bg-surface-active hover:text-content-primary"
            >
              Export .md
            </button>
            <button
              onClick={onClose}
              autoFocus
              className="rounded-md px-2 py-1 text-xs text-content-muted transition-colors hover:bg-surface-hover"
            >
              Close
            </button>
          </div>
        </div>

        {/* Optional focus prompt */}
        {document.focusPrompt != null && (
          <div className="border-b border-edge-subtle bg-accent-blue/5 px-6 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-accent-blue">User focus</p>
            <p className="mt-0.5 text-xs text-content-muted">{document.focusPrompt}</p>
          </div>
        )}

        {/* Markdown body */}
        <div className="prose-sm flex-1 overflow-y-auto px-8 py-6 text-sm text-content-primary">
          <MarkdownContent content={document.content} />
        </div>
      </div>
    </div>
  )
}
