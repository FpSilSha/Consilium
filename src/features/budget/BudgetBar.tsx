import { type ReactNode, useState, useCallback } from 'react'
import { useStore } from '@/store'
import { Tooltip } from '@/features/ui/Tooltip'
import { getSessionTotalCost, isBudgetWarning, isBudgetExceeded, getBudgetUsagePercent } from './budget-engine'
import { CostBreakdownModal } from './CostBreakdownModal'

export function BudgetBar(): ReactNode {
  const sessionBudget = useStore((s) => s.sessionBudget)
  const setSessionBudget = useStore((s) => s.setSessionBudget)
  const budgetWarningDismissed = useStore((s) => s.budgetWarningDismissed)
  const dismissBudgetWarning = useStore((s) => s.dismissBudgetWarning)
  const windowOrder = useStore((s) => s.windowOrder)
  const windows = useStore((s) => s.windows)
  const messages = useStore((s) => s.messages)
  const orModels = useStore((s) => s.catalogModels['openrouter']) ?? []
  // Subscribe to sessionCompileCost so the displayed total updates when
  // a compile finishes (Zustand re-renders only on subscribed slices).
  const sessionCompileCost = useStore((s) => s.sessionCompileCost)

  const [showBudgetInput, setShowBudgetInput] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [budgetValue, setBudgetValue] = useState('')

  // Combined total: advisor running costs + compile cost (which is tracked
  // separately because compile is not an advisor turn). The progress bar
  // and budget checks use getSessionTotalCost() which sums the same fields,
  // so this stays in sync.
  const advisorCost = windowOrder.reduce((sum, id) => {
    const w = windows[id]
    return sum + (w?.runningCost ?? 0)
  }, 0)
  const totalCost = advisorCost + sessionCompileCost

  const untrackedCount = messages.filter(
    (m) => m.role === 'assistant' && m.costMetadata == null,
  ).length

  const showWarning = sessionBudget > 0 && isBudgetWarning(sessionBudget) && !budgetWarningDismissed
  const exceeded = sessionBudget > 0 && isBudgetExceeded(sessionBudget)
  const usagePercent = getBudgetUsagePercent(sessionBudget)

  const handleSetBudget = useCallback(() => {
    const parsed = parseFloat(budgetValue)
    if (!isNaN(parsed) && parsed >= 0) {
      setSessionBudget(Math.min(parsed, 10_000))
    }
    setShowBudgetInput(false)
    setBudgetValue('')
  }, [budgetValue, setSessionBudget])

  const budgetLabel = sessionBudget > 0 ? `$${sessionBudget.toFixed(2)}` : '∞'

  return (
    <div className="flex flex-col gap-0.5 pt-1">
      {/* Cost — clickable for breakdown */}
      <Tooltip text="View cost breakdown" position="bottom">
        <button
          onClick={() => setShowBreakdown(true)}
          className="text-left text-xs text-content-muted transition-colors hover:text-content-primary"
        >
          Cost: ~${totalCost.toFixed(4)}
          {untrackedCount > 0 && (
            <span className="ml-1">+ {untrackedCount} unknown</span>
          )}
        </button>
      </Tooltip>

      {/* Budget — clickable to set */}
      <div className="flex items-center gap-1.5">
        <Tooltip text="Click to set session budget. Warning: cost can't be measured mid-stream — calculated after output." position="bottom">
          <button
            onClick={() => setShowBudgetInput(true)}
            className="text-left text-xs text-content-muted transition-colors hover:text-content-primary"
            data-action="set-budget"
          >
            Budget: {budgetLabel}
          </button>
        </Tooltip>
        {sessionBudget > 0 && (
          <div className="h-1.5 w-12 rounded-full bg-surface-active">
            <div
              className={`h-full rounded-full transition-all ${
                exceeded ? 'bg-accent-red' : usagePercent >= 80 ? 'bg-yellow-500' : 'bg-accent-green'
              }`}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Cost breakdown modal */}
      {showBreakdown && (
        <CostBreakdownModal
          messages={messages}
          windows={windows}
          windowOrder={windowOrder}
          orModels={orModels}
          totalCost={totalCost}
          compileCost={sessionCompileCost}
          onClose={() => setShowBreakdown(false)}
        />
      )}

      {/* Budget input dialog */}
      {showBudgetInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 max-w-xs rounded-lg border border-edge-subtle bg-surface-panel p-4">
            <h3 className="mb-2 text-sm font-medium text-content-primary">Session Budget</h3>
            <p className="mb-3 text-xs text-content-muted">
              Set a spending cap. Warning at 80%, halt at 100%. Enter 0 for no limit.
            </p>
            <input
              type="number"
              value={budgetValue}
              onChange={(e) => setBudgetValue(e.target.value)}
              placeholder={sessionBudget > 0 ? sessionBudget.toString() : '5.00'}
              step="0.50"
              min="0"
              max="10000"
              className="mb-3 w-full rounded border border-edge-subtle bg-surface-base px-3 py-1.5 text-sm text-content-primary outline-none focus:border-edge-focus"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSetBudget()}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowBudgetInput(false); setBudgetValue('') }}
                className="rounded px-3 py-1 text-xs text-content-muted hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleSetBudget}
                className="rounded bg-accent-blue px-3 py-1 text-xs font-medium text-content-inverse hover:bg-accent-blue/90"
              >
                Set
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Budget warning */}
      {showWarning && !exceeded && (
        <div className="fixed bottom-16 right-4 z-40 rounded-lg border border-yellow-700 bg-yellow-900/90 px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-yellow-300">
              Budget 80% reached (~${totalCost.toFixed(4)} / ${sessionBudget.toFixed(2)})
            </span>
            <button
              onClick={dismissBudgetWarning}
              className="text-xs text-yellow-500 hover:text-yellow-300"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Budget exceeded */}
      {exceeded && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-accent-red bg-surface-panel px-6 py-3 shadow-lg">
          <span className="text-sm font-medium text-accent-red">
            Budget exceeded — all API calls halted
          </span>
        </div>
      )}
    </div>
  )
}
