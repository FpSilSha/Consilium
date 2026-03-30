import { type ReactNode, useState, useCallback } from 'react'
import { useStore } from '@/store'
import { createUserMessage } from '@/services/context-bus'
import { handleUserMessage, startRun } from '@/features/turnManager'
import { isUserTurn } from '@/features/turnManager'
import { hasMentions, executeAgentExchange, repeatLastExchange, hasLastExchange } from '@/features/agentInteraction'

export function SharedInputBar(): ReactNode {
  const [input, setInput] = useState('')
  const appendMessage = useStore((s) => s.appendMessage)
  const isRunning = useStore((s) => s.isRunning)
  const turnMode = useStore((s) => s.turnMode)
  const queue = useStore((s) => s.queue)
  const [showRepeat, setShowRepeat] = useState(false)

  const showUserTurnHint = isRunning && isUserTurn(queue)

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim()
    if (trimmed === '') return

    setInput('')

    if (hasMentions(trimmed)) {
      setShowRepeat(true)
      executeAgentExchange(trimmed).catch(() => {})
      return
    }

    const message = createUserMessage(trimmed, 'user-input')
    appendMessage(message)

    if (isRunning) {
      handleUserMessage()
    } else if (turnMode === 'parallel') {
      startRun()
    }
  }, [input, appendMessage, isRunning, turnMode])

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

  return (
    <div className="flex flex-col gap-2">
      {showRepeat && hasLastExchange() && (
        <button
          onClick={handleRepeat}
          className="self-start rounded-md bg-surface-hover px-2.5 py-1 text-xs text-content-muted transition-colors hover:bg-surface-active hover:text-content-primary"
        >
          Repeat Last Agent-to-Agent
        </button>
      )}
      <div className="flex items-end gap-2">
        {/* Attachment placeholder */}
        <button
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-surface-hover hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          aria-label="Attach file (coming soon)"
          disabled
        >
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-5 w-5">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
        </button>

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
          disabled={input.trim() === ''}
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
