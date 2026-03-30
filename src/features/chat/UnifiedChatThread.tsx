import { type ReactNode, useRef, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import { UnifiedMessageBubble } from './UnifiedMessageBubble'
import { StreamingIndicator } from './StreamingIndicator'

/** Pixel tolerance for considering the user "at the bottom". */
const SCROLL_PIN_THRESHOLD = 80

/**
 * Single interleaved chat thread for the unified context bus.
 * Replaces the per-window ChatView approach with a single interleaved thread.
 *
 * All advisor and user messages render in one scrollable column
 * with color-coded persona attribution. Auto-scrolls only when
 * the user is pinned near the bottom; scrolling up disables it.
 */
export function UnifiedChatThread(): ReactNode {
  const messages = useStore((s) => s.messages)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isPinnedRef = useRef(true)

  const anyStreaming = useStore((s) =>
    s.windowOrder.some((id) => s.windows[id]?.isStreaming === true),
  )

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (el == null) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isPinnedRef.current = distanceFromBottom < SCROLL_PIN_THRESHOLD
  }, [])

  // Auto-scroll only when pinned to bottom
  useEffect(() => {
    const el = scrollRef.current
    if (el == null || !isPinnedRef.current) return
    el.scrollTop = el.scrollHeight
  }, [messages.length, anyStreaming])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-content-muted">
          Start a conversation to begin.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      role="log"
      aria-label="Conversation"
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto"
    >
      {messages.map((msg) => (
        <UnifiedMessageBubble key={msg.id} message={msg} />
      ))}
      <StreamingIndicator />
    </div>
  )
}
