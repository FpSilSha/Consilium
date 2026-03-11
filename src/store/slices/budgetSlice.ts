import type { StateCreator } from 'zustand'

export interface BudgetSlice {
  readonly sessionBudget: number // 0 = no budget
  readonly budgetWarningDismissed: boolean
  setSessionBudget: (budget: number) => void
  dismissBudgetWarning: () => void
  resetBudgetWarning: () => void
}

export const createBudgetSlice: StateCreator<BudgetSlice> = (set) => ({
  sessionBudget: 0,
  budgetWarningDismissed: false,

  setSessionBudget: (budget) =>
    set({ sessionBudget: Math.max(0, budget), budgetWarningDismissed: false }),

  dismissBudgetWarning: () => set({ budgetWarningDismissed: true }),

  resetBudgetWarning: () => set({ budgetWarningDismissed: false }),
})
