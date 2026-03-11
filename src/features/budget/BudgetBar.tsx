import { type ReactNode, useState, useCallback } from 'react'
import { useStore } from '@/store'
import { getSessionTotalCost, isBudgetWarning, isBudgetExceeded, getBudgetUsagePercent } from './budget-engine'

export function BudgetBar(): ReactNode {
  const sessionBudget = useStore((s) => s.sessionBudget)
  const setSessionBudget = useStore((s) => s.setSessionBudget)
  const budgetWarningDismissed = useStore((s) => s.budgetWarningDismissed)
  const dismissBudgetWarning = useStore((s) => s.dismissBudgetWarning)
  const windowOrder = useStore((s) => s.windowOrder)
  const windows = useStore((s) => s.windows)

  const [showBudgetInput, setShowBudgetInput] = useState(false)
  const [budgetValue, setBudgetValue] = useState('')

  // Recompute total cost from windows
  const totalCost = windowOrder.reduce((sum, id) => {
    const w = windows[id]
    return sum + (w?.runningCost ?? 0)
  }, 0)

  const showWarning = sessionBudget > 0 && isBudgetWarning(sessionBudget) && !budgetWarningDismissed
  const exceeded = sessionBudget > 0 && isBudgetExceeded(sessionBudget)
  const usagePercent = getBudgetUsagePercent(sessionBudget)

  const handleSetBudget = useCallback(() => {
    const parsed = parseFloat(budgetValue)
    if (!isNaN(parsed) && parsed >= 0) {
      setSessionBudget(parsed)
    }
    setShowBudgetInput(false)
    setBudgetValue('')
  }, [budgetValue, setSessionBudget])

  return (
    <div className="flex items-center gap-2">
      {/* Total cost display */}
      <span className="text-xs text-gray-500">
        ~${totalCost.toFixed(4)}
      </span>

      {/* Budget indicator */}
      {sessionBudget > 0 && (
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-12 rounded-full bg-gray-700">
            <div
              className={`h-full rounded-full transition-all ${
                exceeded ? 'bg-red-500' : usagePercent >= 80 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">/${sessionBudget.toFixed(2)}</span>
        </div>
      )}

      {/* Set/change budget button */}
      <button
        onClick={() => setShowBudgetInput(true)}
        className="rounded px-1.5 py-0.5 text-xs text-gray-600 hover:text-gray-400"
        title="Set session budget"
      >
        $
      </button>

      {/* Budget input dialog */}
      {showBudgetInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 max-w-xs rounded-lg border border-gray-700 bg-gray-900 p-4">
            <h3 className="mb-2 text-sm font-medium text-gray-200">Session Budget</h3>
            <p className="mb-3 text-xs text-gray-400">
              Set a spending cap. Warning at 80%, halt at 100%. Enter 0 for no limit.
            </p>
            <input
              type="number"
              value={budgetValue}
              onChange={(e) => setBudgetValue(e.target.value)}
              placeholder={sessionBudget > 0 ? sessionBudget.toString() : '5.00'}
              step="0.50"
              min="0"
              className="mb-3 w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-gray-500"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSetBudget()}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowBudgetInput(false); setBudgetValue('') }}
                className="rounded px-3 py-1 text-xs text-gray-400 hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSetBudget}
                className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500"
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
        <div className="fixed bottom-16 right-4 z-40 rounded-lg border border-red-700 bg-red-900/90 px-4 py-2">
          <span className="text-xs text-red-300">
            Budget exceeded. All API calls halted.
          </span>
        </div>
      )}
    </div>
  )
}
