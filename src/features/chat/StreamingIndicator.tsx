import type { ReactNode } from 'react'
import { useStore } from '@/store'

/**
 * Shows active streaming indicators for all advisors currently generating.
 *
 * Each streaming window gets its own sub-component that subscribes narrowly
 * to only that window's data, preventing cross-window re-render cascades.
 */
export function StreamingIndicator(): ReactNode {
  // Subscribe to windowOrder (stable unless windows are added/removed)
  // and derive which IDs are streaming via a stable boolean check
  const windowOrder = useStore((s) => s.windowOrder)

  return (
    <>
      {windowOrder.map((id) => (
        <StreamingBubbleIfActive key={id} windowId={id} />
      ))}
    </>
  )
}

/** Renders a streaming bubble only if the window is actively streaming. */
function StreamingBubbleIfActive({ windowId }: { readonly windowId: string }): ReactNode {
  // Narrow subscription: only this window's streaming state
  const isStreaming = useStore((s) => s.windows[windowId]?.isStreaming === true)

  if (!isStreaming) return null

  return <StreamingBubble windowId={windowId} />
}

/** The actual streaming content — subscribes only to its own window. */
function StreamingBubble({ windowId }: { readonly windowId: string }): ReactNode {
  const personaLabel = useStore((s) => s.windows[windowId]?.personaLabel ?? '')
  const accentColor = useStore((s) => s.windows[windowId]?.accentColor ?? '#9BA8B5')
  const streamContent = useStore((s) => s.windows[windowId]?.streamContent ?? '')

  return (
    <div className="flex justify-start gap-3 px-4 py-2">
      <div
        className="mt-1 h-3 w-3 shrink-0 animate-pulse rounded-full"
        style={{ backgroundColor: accentColor }}
      />
      <div className="min-w-0 max-w-[80%]">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-xs font-semibold" style={{ color: accentColor }}>
            {personaLabel}
          </span>
          <span className="text-xs text-content-muted">typing...</span>
        </div>
        <div className="rounded-lg bg-surface-panel px-3 py-2.5 text-sm text-content-primary">
          <div className="whitespace-pre-wrap break-words">
            {streamContent}
            <span className="ml-0.5 animate-pulse text-content-muted">▋</span>
          </div>
        </div>
      </div>
    </div>
  )
}
