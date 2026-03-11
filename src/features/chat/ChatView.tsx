import { type ReactNode, type CSSProperties, type ReactElement, useRef, useEffect } from 'react'
import { List, useDynamicRowHeight, useListRef } from 'react-window'
import type { Message } from '@/types'
import { MessageBubble } from './MessageBubble'
import { TerminalMessage } from './TerminalMessage'

export type UIMode = 'gui' | 'terminal'

/** Threshold below which we skip virtualization for simplicity. */
const VIRTUALIZATION_THRESHOLD = 50

/** Default estimated row height for un-measured items. */
const DEFAULT_ROW_HEIGHT = 60

interface ChatViewProps {
  readonly messages: readonly Message[]
  readonly mode: UIMode
  readonly accentColor?: string
  readonly streamingContent?: string
  readonly streamingLabel?: string
  readonly isStreaming?: boolean
}

interface RowProps {
  readonly messages: readonly Message[]
  readonly mode: UIMode
  readonly accentColor: string | undefined
  readonly dynamicRowHeight: ReturnType<typeof useDynamicRowHeight>
}

function VirtualRow(props: {
  readonly index: number
  readonly style: CSSProperties
  readonly ariaAttributes: { readonly 'aria-posinset': number; readonly 'aria-setsize': number; readonly role: 'listitem' }
} & RowProps): ReactElement | null {
  const { index, style, messages, mode, accentColor, dynamicRowHeight } = props
  const msg = messages[index]
  if (msg === undefined) return null

  const MessageComponent = mode === 'terminal' ? TerminalMessage : MessageBubble

  return (
    <div style={style} data-index={index} ref={(el) => {
      if (el !== null) {
        dynamicRowHeight.observeRowElements([el])
      }
    }}>
      <MessageComponent message={msg} accentColor={accentColor} />
    </div>
  )
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
  const listRef = useListRef(null)
  const dynamicRowHeight = useDynamicRowHeight({ defaultRowHeight: DEFAULT_ROW_HEIGHT })

  const MessageComponent = mode === 'terminal' ? TerminalMessage : MessageBubble
  const useVirtualization = messages.length >= VIRTUALIZATION_THRESHOLD

  // Auto-scroll for non-virtualized mode
  useEffect(() => {
    if (useVirtualization) return
    const el = scrollRef.current
    if (el === null) return
    el.scrollTop = el.scrollHeight
  }, [messages.length, streamingContent, useVirtualization])

  // Auto-scroll for virtualized mode
  useEffect(() => {
    if (!useVirtualization) return
    const list = listRef.current
    if (list === null) return
    list.scrollToRow({ index: messages.length - 1, align: 'end' })
  }, [messages.length, useVirtualization, listRef])

  const streamingIndicator = isStreaming === true && streamingContent !== undefined && streamingContent !== '' ? (
    <div className="px-3 py-1.5" style={{ minHeight: DEFAULT_ROW_HEIGHT }}>
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
  ) : null

  // Non-virtualized mode for small message lists
  if (!useVirtualization) {
    return (
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.map((msg) => (
          <MessageComponent
            key={msg.id}
            message={msg}
            accentColor={accentColor}
          />
        ))}
        {streamingIndicator}
      </div>
    )
  }

  // Virtualized mode for large message lists
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <List<RowProps>
        listRef={listRef}
        rowCount={messages.length}
        rowHeight={dynamicRowHeight}
        rowComponent={VirtualRow}
        rowProps={{ messages, mode, accentColor, dynamicRowHeight }}
        overscanCount={5}
        style={{ flex: 1 }}
      />
      {streamingIndicator}
    </div>
  )
}
