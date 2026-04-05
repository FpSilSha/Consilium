import type { ReactNode } from 'react'
import type { Message } from '@/types'

interface TerminalMessageProps {
  readonly message: Message
  readonly accentColor?: string | undefined
}

export function TerminalMessage({ message, accentColor }: TerminalMessageProps): ReactNode {
  const isUser = message.role === 'user'
  const label = isUser ? 'you' : message.personaLabel.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="px-3 py-1 font-mono text-sm">
      <span
        className="font-bold"
        style={{ color: isUser ? '#60a5fa' : (accentColor ?? '#9ca3af') }}
      >
        {label} &gt;{' '}
      </span>
      <span className="whitespace-pre-wrap text-content-primary">{message.content}</span>
      {message.costMetadata !== undefined && (
        <span className="ml-2 text-xs text-content-disabled">
          [~${message.costMetadata.estimatedCost.toFixed(4)}]
        </span>
      )}
    </div>
  )
}
