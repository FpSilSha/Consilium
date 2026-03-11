import { type ReactNode, useRef, useEffect } from 'react'
import type { Message } from '@/types'
import { MessageBubble } from './MessageBubble'
import { TerminalMessage } from './TerminalMessage'

export type UIMode = 'gui' | 'terminal'

interface ChatViewProps {
  readonly messages: readonly Message[]
  readonly mode: UIMode
  readonly accentColor?: string
  readonly streamingContent?: string
  readonly streamingLabel?: string
  readonly isStreaming?: boolean
}

export function ChatView({
  messages,
  mode,
  accentColor,
  streamingContent,
  streamingLabel,
  isStreaming,
}: ChatViewProps): ReactNode {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive or during streaming
  useEffect(() => {
    const el = scrollRef.current
    if (el === null) return
    el.scrollTop = el.scrollHeight
  }, [messages.length, streamingContent])

  const MessageComponent = mode === 'terminal' ? TerminalMessage : MessageBubble

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      {messages.map((msg) => (
        <MessageComponent
          key={msg.id}
          message={msg}
          accentColor={accentColor}
        />
      ))}

      {/* Streaming indicator */}
      {isStreaming === true && streamingContent !== undefined && streamingContent !== '' && (
        <div className="px-3 py-1.5">
          {mode === 'terminal' ? (
            <div className="font-mono text-sm">
              <span
                className="font-bold"
                style={{ color: accentColor ?? '#9ca3af' }}
              >
                {(streamingLabel ?? 'advisor').toLowerCase().replace(/\s+/g, '-')} &gt;{' '}
              </span>
              <span className="whitespace-pre-wrap text-gray-200">
                {streamingContent}
                <span className="animate-pulse">|</span>
              </span>
            </div>
          ) : (
            <div className="flex justify-start">
              <div
                className="max-w-[85%] rounded-lg bg-gray-800/50 px-3 py-2 text-sm text-gray-200"
                style={
                  accentColor !== undefined
                    ? { borderLeftColor: accentColor, borderLeftWidth: 2 }
                    : undefined
                }
              >
                {streamingLabel !== undefined && (
                  <div
                    className="mb-1 text-xs font-medium"
                    style={{ color: accentColor ?? '#9ca3af' }}
                  >
                    {streamingLabel}
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words">
                  {streamingContent}
                  <span className="animate-pulse">|</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
