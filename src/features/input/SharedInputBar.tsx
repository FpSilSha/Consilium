import { type ReactNode, useState, useCallback } from 'react'
import { useStore } from '@/store'
import { createUserMessage } from '@/services/context-bus'

export function SharedInputBar(): ReactNode {
  const [input, setInput] = useState('')
  const appendMessage = useStore((s) => s.appendMessage)

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim()
    if (trimmed === '') return

    const message = createUserMessage(trimmed, 'user-input')
    appendMessage(message)
    setInput('')
  }, [input, appendMessage])

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
    <div className="flex gap-2">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Message your advisors... (Enter to send, Shift+Enter for new line)"
        rows={1}
        className="flex-1 resize-none rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-gray-500"
      />
      <button
        onClick={handleSubmit}
        disabled={input.trim() === ''}
        className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600"
      >
        Send
      </button>
    </div>
  )
}
