import type { ReactNode } from 'react'
import type { Message } from '@/types'

interface MessageBubbleProps {
  readonly message: Message
  readonly accentColor?: string | undefined
}

export function MessageBubble({ message, accentColor }: MessageBubbleProps): ReactNode {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} px-3 py-1.5`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? 'bg-blue-900/50 text-gray-100'
            : 'bg-gray-800/50 text-gray-200'
        }`}
        style={
          !isUser && accentColor !== undefined
            ? { borderLeftColor: accentColor, borderLeftWidth: 2 }
            : undefined
        }
      >
        {!isUser && (
          <div
            className="mb-1 text-xs font-medium"
            style={{ color: accentColor ?? '#9ca3af' }}
          >
            {message.personaLabel}
          </div>
        )}
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        {message.costMetadata !== undefined && (
          <div className="mt-1 text-right text-xs text-gray-500">
            ~${message.costMetadata.estimatedCost.toFixed(4)}
            {message.costMetadata.isEstimate ? ' (est)' : ''}
          </div>
        )}
      </div>
    </div>
  )
}
