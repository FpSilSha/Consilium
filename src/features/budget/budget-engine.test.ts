import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/store', () => ({
  useStore: {
    getState: vi.fn(),
  },
}))

import { useStore } from '@/store'
import {
  getSessionTotalCost,
  isBudgetWarning,
  isBudgetExceeded,
  getRemainingBudget,
  getBudgetUsagePercent,
} from '@/features/budget/budget-engine'

// ---------------------------------------------------------------------------
// Store mock helper
// ---------------------------------------------------------------------------

function mockStoreWithWindows(windows: Record<string, { runningCost?: number }>, order?: string[]) {
  const windowOrder = order ?? Object.keys(windows)
  vi.mocked(useStore.getState).mockReturnValue({
    windowOrder,
    windows,
  } as any)
}

function mockStoreWithCost(cost: number) {
  mockStoreWithWindows({ w1: { runningCost: cost } }, ['w1'])
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// getSessionTotalCost
// ---------------------------------------------------------------------------

describe('getSessionTotalCost', () => {
  it('returns 0 when windowOrder is empty', () => {
    mockStoreWithWindows({}, [])

    expect(getSessionTotalCost()).toBe(0)
  })

  it('returns the cost of a single window', () => {
    mockStoreWithCost(3.5)

    expect(getSessionTotalCost()).toBe(3.5)
  })

  it('sums costs across multiple windows', () => {
    mockStoreWithWindows(
      {
        w1: { runningCost: 1.5 },
        w2: { runningCost: 2.0 },
        w3: { runningCost: 0.75 },
      },
      ['w1', 'w2', 'w3'],
    )

    expect(getSessionTotalCost()).toBeCloseTo(4.25)
  })

  it('treats undefined runningCost as 0', () => {
    mockStoreWithWindows(
      {
        w1: { runningCost: 2.0 },
        w2: {},
      },
      ['w1', 'w2'],
    )

    expect(getSessionTotalCost()).toBe(2.0)
  })

  it('handles window id in windowOrder that does not exist in windows map', () => {
    vi.mocked(useStore.getState).mockReturnValue({
      windowOrder: ['w1', 'ghost'],
      windows: { w1: { runningCost: 5 } },
    } as any)

    // ghost window is undefined, so its cost should be treated as 0
    expect(getSessionTotalCost()).toBe(5)
  })

  it('returns 0 when all windows have zero cost', () => {
    mockStoreWithWindows(
      { w1: { runningCost: 0 }, w2: { runningCost: 0 } },
      ['w1', 'w2'],
    )

    expect(getSessionTotalCost()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// isBudgetWarning
// ---------------------------------------------------------------------------

describe('isBudgetWarning', () => {
  it('returns false when budget is 0', () => {
    mockStoreWithCost(10)

    expect(isBudgetWarning(0)).toBe(false)
  })

  it('returns false when budget is negative', () => {
    mockStoreWithCost(10)

    expect(isBudgetWarning(-5)).toBe(false)
  })

  it('returns false when cost is below the 80% threshold', () => {
    mockStoreWithCost(7.99)

    expect(isBudgetWarning(10)).toBe(false)
  })

  it('returns true when cost is exactly at the 80% threshold', () => {
    mockStoreWithCost(8)

    expect(isBudgetWarning(10)).toBe(true)
  })

  it('returns true when cost exceeds the 80% threshold but is under budget', () => {
    mockStoreWithCost(9)

    expect(isBudgetWarning(10)).toBe(true)
  })

  it('returns true when cost equals the full budget (also past warning threshold)', () => {
    mockStoreWithCost(10)

    expect(isBudgetWarning(10)).toBe(true)
  })

  it('returns true when cost exceeds the full budget', () => {
    mockStoreWithCost(15)

    expect(isBudgetWarning(10)).toBe(true)
  })

  it('handles fractional budgets correctly at boundary', () => {
    // 80% of 0.50 = 0.40
    mockStoreWithCost(0.40)

    expect(isBudgetWarning(0.50)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isBudgetExceeded
// ---------------------------------------------------------------------------

describe('isBudgetExceeded', () => {
  it('returns false when budget is 0', () => {
    mockStoreWithCost(100)

    expect(isBudgetExceeded(0)).toBe(false)
  })

  it('returns false when budget is negative', () => {
    mockStoreWithCost(100)

    expect(isBudgetExceeded(-1)).toBe(false)
  })

  it('returns false when cost is below the budget', () => {
    mockStoreWithCost(5)

    expect(isBudgetExceeded(10)).toBe(false)
  })

  it('returns true when cost equals the budget exactly', () => {
    mockStoreWithCost(10)

    expect(isBudgetExceeded(10)).toBe(true)
  })

  it('returns true when cost exceeds the budget', () => {
    mockStoreWithCost(10.01)

    expect(isBudgetExceeded(10)).toBe(true)
  })

  it('returns false when cost is zero and budget is positive', () => {
    mockStoreWithCost(0)

    expect(isBudgetExceeded(10)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getRemainingBudget
// ---------------------------------------------------------------------------

describe('getRemainingBudget', () => {
  it('returns Infinity when budget is 0', () => {
    mockStoreWithCost(5)

    expect(getRemainingBudget(0)).toBe(Infinity)
  })

  it('returns Infinity when budget is negative', () => {
    mockStoreWithCost(5)

    expect(getRemainingBudget(-10)).toBe(Infinity)
  })

  it('returns budget minus cost when cost is below budget', () => {
    mockStoreWithCost(3)

    expect(getRemainingBudget(10)).toBeCloseTo(7)
  })

  it('returns 0 when cost equals budget', () => {
    mockStoreWithCost(10)

    expect(getRemainingBudget(10)).toBe(0)
  })

  it('returns 0 (not negative) when cost exceeds budget', () => {
    mockStoreWithCost(15)

    expect(getRemainingBudget(10)).toBe(0)
  })

  it('returns full budget when session cost is zero', () => {
    mockStoreWithCost(0)

    expect(getRemainingBudget(10)).toBe(10)
  })

  it('handles fractional values correctly', () => {
    mockStoreWithCost(1.25)

    expect(getRemainingBudget(5)).toBeCloseTo(3.75)
  })
})

// ---------------------------------------------------------------------------
// getBudgetUsagePercent
// ---------------------------------------------------------------------------

describe('getBudgetUsagePercent', () => {
  it('returns 0 when budget is 0', () => {
    mockStoreWithCost(50)

    expect(getBudgetUsagePercent(0)).toBe(0)
  })

  it('returns 0 when budget is negative', () => {
    mockStoreWithCost(50)

    expect(getBudgetUsagePercent(-5)).toBe(0)
  })

  it('returns 0 when session cost is zero', () => {
    mockStoreWithCost(0)

    expect(getBudgetUsagePercent(10)).toBe(0)
  })

  it('returns 50 when cost is half the budget', () => {
    mockStoreWithCost(5)

    expect(getBudgetUsagePercent(10)).toBeCloseTo(50)
  })

  it('returns 80 when cost is 80% of budget', () => {
    mockStoreWithCost(8)

    expect(getBudgetUsagePercent(10)).toBeCloseTo(80)
  })

  it('returns 100 when cost exactly equals budget', () => {
    mockStoreWithCost(10)

    expect(getBudgetUsagePercent(10)).toBe(100)
  })

  it('caps at 100 when cost exceeds budget', () => {
    mockStoreWithCost(20)

    expect(getBudgetUsagePercent(10)).toBe(100)
  })

  it('handles fractional percentages correctly', () => {
    mockStoreWithCost(1)

    expect(getBudgetUsagePercent(3)).toBeCloseTo(33.33, 1)
  })
})
