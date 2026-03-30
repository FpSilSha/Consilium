import type { ReactNode } from 'react'
import type { AdvisorWindow } from '@/types'
import { useStore } from '@/store'

interface StreamingEntry {
  readonly id: string
  readonly personaLabel: string
  readonly accentColor: string
  readonly streamContent: string
}

/** Derive streaming entries from store in a single selector */
function selectStreamingWindows(s: {
  readonly windowOrder: readonly string[]
  readonly windows: Readonly<Record<string, AdvisorWindow>>
}): readonly StreamingEntry[] {
  return s.windowOrder
    .map((id) => s.windows[id])
    .filter((w): w is AdvisorWindow => w != null && w.isStreaming)
    .map((w) => ({
      id: w.id,
      personaLabel: w.personaLabel,
      accentColor: w.accentColor,
      streamContent: w.streamContent,
    }))
}

/**
 * Shows active streaming indicators for all advisors currently generating.
 * In parallel mode, multiple indicators may display simultaneously.
 * Shows a pulsing indicator even before the first token arrives.
 */
export function StreamingIndicator(): ReactNode {
  const streamingWindows = useStore(selectStreamingWindows)

  if (streamingWindows.length === 0) return null

  return (
    <div className="flex flex-col gap-2 px-4 py-2">
      {streamingWindows.map((entry) => (
        <div key={entry.id} className="flex justify-start gap-3">
          {/* Pulsing color dot */}
          <div
            className="mt-1 h-3 w-3 shrink-0 animate-pulse rounded-full"
            style={{ backgroundColor: entry.accentColor }}
          />

          <div className="min-w-0 max-w-[80%]">
            {/* Header */}
            <div className="mb-1 flex items-baseline gap-2">
              <span className="text-xs font-semibold" style={{ color: entry.accentColor }}>
                {entry.personaLabel}
              </span>
              <span className="text-xs text-content-muted">typing...</span>
            </div>

            {/* Streaming content */}
            <div className="rounded-lg bg-surface-panel px-3 py-2.5 text-sm text-content-primary">
              <div className="whitespace-pre-wrap break-words">
                {entry.streamContent}
                <span className="ml-0.5 animate-pulse text-content-muted">▋</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
