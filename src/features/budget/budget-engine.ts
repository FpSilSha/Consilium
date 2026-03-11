import { useStore } from '@/store'

const DEFAULT_BUDGET = 0 // 0 = no budget set
const WARNING_THRESHOLD = 0.8

/**
 * Gets the total session cost across all windows.
 */
export function getSessionTotalCost(): number {
  const state = useStore.getState()
  return state.windowOrder.reduce((total, id) => {
    const w = state.windows[id]
    return total + (w?.runningCost ?? 0)
  }, 0)
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
