import { type ReactNode, useState, useCallback } from 'react'
import type { Attachment } from '@/types'
import { useStore } from '@/store'
import { createUserMessage } from '@/services/context-bus'
import { handleUserMessage, startRun } from '@/features/turnManager'
import { isUserTurn } from '@/features/turnManager'
import { hasMentions, executeAgentExchange, repeatLastExchange, hasLastExchange } from '@/features/agentInteraction'
import { AttachButton, readBrowserFile } from './AttachButton'
import { CompileDocumentButton } from '@/features/chat/CompileDocumentButton'
import { MainThreadCompactButton } from '@/features/compaction'

export function SharedInputBar(): ReactNode {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<readonly Attachment[]>([])
  const appendMessage = useStore((s) => s.appendMessage)
  const isRunning = useStore((s) => s.isRunning)
  const turnMode = useStore((s) => s.turnMode)
  const queue = useStore((s) => s.queue)
  const windowCount = useStore((s) => s.windowOrder.length)
  const [showRepeat, setShowRepeat] = useState(false)

  const showUserTurnHint = isRunning && isUserTurn(queue)

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim()
    if (trimmed === '' && attachments.length === 0) return

    const currentAttachments = attachments
    setInput('')
    setAttachments([])

    if (hasMentions(trimmed)) {
      setShowRepeat(true)
      executeAgentExchange(trimmed).catch(() => {})
      return
    }

    const message = createUserMessage(
      trimmed,
      'user-input',
      currentAttachments.length > 0 ? currentAttachments : undefined,
    )
    appendMessage(message)

    if (isRunning) {
      handleUserMessage()
    } else if (turnMode !== 'manual' && windowCount > 0 && queue.length > 0) {
      startRun()
      // The message was sent before the run started — mark the user turn as done
      handleUserMessage()
    }
  }, [input, attachments, appendMessage, isRunning, turnMode, queue, windowCount])

  const handleRepeat = useCallback(() => {
    repeatLastExchange().catch(() => {})
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    if (files.length === 0) return

    const newAttachments = await Promise.all(
      Array.from(files).map((file) => readBrowserFile(file)),
    )
    setAttachments((prev) => [...prev, ...newAttachments])
  }, [])

  return (
    <div
      className={`flex flex-col gap-2 ${dragOver ? 'rounded-lg ring-2 ring-accent-blue ring-offset-2 ring-offset-surface-base' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Action buttons above input */}
      <div className="flex items-center gap-2">
        {showRepeat && hasLastExchange() && (
          <button
            onClick={handleRepeat}
            className="rounded-md bg-surface-hover px-2.5 py-1 text-xs text-content-muted transition-colors hover:bg-surface-active hover:text-content-primary"
          >
            Repeat Last Agent-to-Agent
          </button>
        )}
        <CompileDocumentButton />
        <MainThreadCompactButton />
      </div>

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-1.5 rounded-md border border-edge-subtle bg-surface-base px-2 py-1"
            >
              {att.type === 'image' ? (
                <img
                  src={`data:${att.mimeType};base64,${att.data}`}
                  alt={att.name}
                  className="h-8 w-8 rounded object-cover"
                />
              ) : (
                <span className="text-[10px] text-content-disabled">📄</span>
              )}
              <span className="max-w-32 truncate text-xs text-content-muted">{att.name}</span>
              <span className="text-[10px] text-content-disabled">
                {formatFileSize(att.sizeBytes)}
              </span>
              <button
                onClick={() => removeAttachment(att.id)}
                className="text-xs text-content-disabled hover:text-accent-red"
                aria-label={`Remove ${att.name}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Attachment button */}
        <AttachButton onAttach={(files) => setAttachments((prev) => [...prev, ...files])} />

        {/* Input area */}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            showUserTurnHint
              ? "It's your turn! Type your message..."
              : 'Message your advisors... (Enter to send, @Agent for direct, Shift+Enter for new line)'
          }
          rows={1}
          className={`flex-1 resize-none rounded-lg border bg-surface-panel px-4 py-2.5 text-sm text-content-primary placeholder-content-disabled outline-none transition-colors focus:border-edge-focus ${
            showUserTurnHint ? 'border-accent-blue' : 'border-edge-subtle'
          }`}
        />

        {/* Send button */}
        <button
          onClick={handleSubmit}
          disabled={input.trim() === '' && attachments.length === 0}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-blue text-content-inverse transition-colors hover:bg-accent-blue/90 disabled:opacity-40"
          aria-label="Send message"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-5 w-5">
            <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95l14.095-5.637a.75.75 0 0 0 0-1.388L3.105 2.288Z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
