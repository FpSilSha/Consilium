import type { ReactNode } from 'react'
import type { Message, AdvisorWindow } from '@/types'
import { getModelById } from '@/features/modelSelector/model-registry'

interface CostBreakdownModalProps {
  readonly messages: readonly Message[]
  readonly windows: Readonly<Record<string, AdvisorWindow>>
  readonly windowOrder: readonly string[]
  readonly orModels: readonly import('@/types').ModelInfo[]
  readonly totalCost: number
  /**
   * Cumulative cost of compile-document calls in this session. Compile is
   * not per-advisor so it doesn't appear in the per-window breakdown rows;
   * we render it as a separate line item below the advisors when non-zero.
   */
  readonly compileCost: number
  readonly onClose: () => void
}

interface AdvisorCostEntry {
  readonly windowId: string
  readonly personaLabel: string
  readonly model: string
  readonly modelName: string
  readonly accentColor: string
  readonly cost: number
  readonly messageCount: number
  readonly untrackedCount: number
}

export function CostBreakdownModal({
  messages,
  windows,
  windowOrder,
  orModels,
  totalCost,
  compileCost,
  onClose,
}: CostBreakdownModalProps): ReactNode {
  // Build per-advisor breakdown
  const entries = buildBreakdown(messages, windows, windowOrder, orModels)
  const totalUntracked = entries.reduce((sum, e) => sum + e.untrackedCount, 0)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cost-breakdown-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="mx-4 w-full max-w-lg rounded-xl border border-edge-subtle bg-surface-panel p-6"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      >
        <div className="flex items-center justify-between">
          <h2 id="cost-breakdown-title" className="text-sm font-semibold text-content-primary">
            Cost Breakdown
          </h2>
          <button
            onClick={onClose}
            autoFocus
            className="rounded-md px-2 py-1 text-xs text-content-muted transition-colors hover:bg-surface-hover"
          >
            Close
          </button>
        </div>

        {/* Total */}
        <div className="mt-3 flex items-baseline justify-between border-b border-edge-subtle pb-3">
          <span className="text-xs text-content-muted">Session Total</span>
          <div className="text-right">
            <span className="text-sm font-medium text-content-primary">
              ~${totalCost.toFixed(4)}
            </span>
            {totalUntracked > 0 && (
              <span className="ml-2 text-xs text-content-disabled">
                + {totalUntracked} unknown
              </span>
            )}
          </div>
        </div>

        {/* Per-advisor rows + compile pseudo-row */}
        <div className="mt-3 flex flex-col gap-2">
          {entries.length === 0 && compileCost === 0 ? (
            <p className="py-4 text-center text-xs text-content-disabled">
              No advisor activity yet.
            </p>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.windowId}
                className="flex items-center gap-3 rounded-md bg-surface-base px-3 py-2"
              >
                {/* Color dot */}
                <div
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.accentColor }}
                />

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-content-primary">
                    {entry.personaLabel}
                  </div>
                  <div className="truncate text-[10px] text-content-disabled">
                    {entry.modelName}
                  </div>
                </div>

                {/* Cost */}
                <div className="shrink-0 text-right">
                  {entry.cost > 0 ? (
                    <span className="text-xs text-content-primary">
                      ~${entry.cost.toFixed(4)}
                    </span>
                  ) : entry.untrackedCount > 0 ? (
                    <span className="text-xs italic text-content-disabled">
                      unknown
                    </span>
                  ) : (
                    <span className="text-xs text-content-disabled">$0</span>
                  )}
                  <div className="text-[10px] text-content-disabled">
                    {entry.messageCount} msg{entry.messageCount !== 1 ? 's' : ''}
                    {entry.untrackedCount > 0 && (
                      <span className="ml-1 text-content-disabled">
                        ({entry.untrackedCount} untracked)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}

          {/* Compile-document pseudo-row — shown when there's any compile cost.
              Compile is not an advisor turn, so it doesn't fit the per-window
              breakdown above. Rendered with a neutral icon and a "Compile"
              label so users can see where their money went. */}
          {compileCost > 0 && (
            <div className="flex items-center gap-3 rounded-md border border-edge-subtle bg-surface-base px-3 py-2">
              <div className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-content-disabled text-[8px] text-content-inverse">
                ✎
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-content-primary">
                  Compile Document
                </div>
                <div className="truncate text-[10px] text-content-disabled">
                  isolated calls outside any advisor
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span className="text-xs text-content-primary">
                  ~${compileCost.toFixed(4)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function buildBreakdown(
  messages: readonly Message[],
  windows: Readonly<Record<string, AdvisorWindow>>,
  windowOrder: readonly string[],
  orModels: readonly import('@/types').ModelInfo[],
): readonly AdvisorCostEntry[] {
  // Aggregate per window
  const map = new Map<string, { cost: number; messageCount: number; untrackedCount: number }>()

  for (const msg of messages) {
    if (msg.role !== 'assistant') continue
    const existing = map.get(msg.windowId) ?? { cost: 0, messageCount: 0, untrackedCount: 0 }
    map.set(msg.windowId, {
      cost: existing.cost + (msg.costMetadata?.estimatedCost ?? 0),
      messageCount: existing.messageCount + 1,
      untrackedCount: existing.untrackedCount + (msg.costMetadata == null ? 1 : 0),
    })
  }

  // Build entries in window order, then add any orphaned windows from messages
  const seen = new Set<string>()
  const entries: AdvisorCostEntry[] = []

  for (const id of windowOrder) {
    seen.add(id)
    const win = windows[id]
    if (win == null) continue
    const stats = map.get(id) ?? { cost: 0, messageCount: 0, untrackedCount: 0 }
    if (stats.messageCount === 0) continue

    entries.push({
      windowId: id,
      personaLabel: win.personaLabel,
      model: win.model,
      modelName: getModelById(win.model, orModels)?.name ?? win.model,
      accentColor: win.accentColor,
      ...stats,
    })
  }

  // Orphaned (window removed but messages remain)
  for (const [windowId, stats] of map) {
    if (seen.has(windowId)) continue
    const firstMsg = messages.find((m) => m.windowId === windowId && m.role === 'assistant')
    entries.push({
      windowId,
      personaLabel: firstMsg?.personaLabel ?? 'Unknown',
      model: '',
      modelName: 'removed advisor',
      accentColor: '#4A90D9',
      ...stats,
    })
  }

  return entries
}
