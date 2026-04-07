import { useStore } from '@/store'

const DEFAULT_BUDGET = 0 // 0 = no budget set
const WARNING_THRESHOLD = 0.8

/**
 * Gets the total session cost across all windows AND compile calls.
 *
 * Compile cost is tracked separately in the documents slice because compile
 * is not an advisor turn and doesn't belong to any window's runningCost.
 * Including it here means the budget cap and warnings respect compile spend.
 */
export function getSessionTotalCost(): number {
  const state = useStore.getState()
  const advisorCost = state.windowOrder.reduce((total, id) => {
    const w = state.windows[id]
    return total + (w?.runningCost ?? 0)
  }, 0)
  // Defensive default — older test mocks and any code path that doesn't
  // include the documents slice in state should still get a number, not NaN.
  return advisorCost + (state.sessionCompileCost ?? 0)
}

/**
 * Checks whether the budget warning threshold has been reached.
 */
export function isBudgetWarning(budget: number): boolean {
  if (budget <= 0) return false
  return getSessionTotalCost() >= budget * WARNING_THRESHOLD
}

/**
 * Checks whether the budget has been exceeded.
 */
export function isBudgetExceeded(budget: number): boolean {
  if (budget <= 0) return false
  return getSessionTotalCost() >= budget
}

/**
 * Gets the remaining budget amount.
 */
export function getRemainingBudget(budget: number): number {
  if (budget <= 0) return Infinity
  return Math.max(0, budget - getSessionTotalCost())
}

/**
 * Gets the budget usage percentage.
 */
export function getBudgetUsagePercent(budget: number): number {
  if (budget <= 0) return 0
  return Math.min((getSessionTotalCost() / budget) * 100, 100)
}
