import type { StateCreator } from 'zustand'
import type { AdvisorWindow } from '@/types'
import type { TurnSlice } from './turnSlice'

export interface WindowsSlice {
  readonly windows: Readonly<Record<string, AdvisorWindow>>
  readonly windowOrder: readonly string[]
  addWindow: (window: AdvisorWindow) => void
  removeWindow: (windowId: string) => void
  updateWindow: (windowId: string, updates: Partial<AdvisorWindow>) => void
  setWindowOrder: (order: readonly string[]) => void
}

export const createWindowsSlice: StateCreator<WindowsSlice & TurnSlice, [], [], WindowsSlice> = (set) => ({
  windows: {},
  windowOrder: [],

  addWindow: (window) =>
    set((state) => ({
      windows: { ...state.windows, [window.id]: window },
      windowOrder: [...state.windowOrder, window.id],
    })),

  removeWindow: (windowId) =>
    set((state) => {
      const { [windowId]: _, ...remaining } = state.windows
      return {
        windows: remaining,
        windowOrder: state.windowOrder.filter((id) => id !== windowId),
        queue: state.queue.filter((c) => c.windowId !== windowId),
        activeCardIds: state.activeCardIds.filter(
          (id) => !state.queue.some((c) => c.id === id && c.windowId === windowId),
        ),
      }
    }),

  updateWindow: (windowId, updates) =>
    set((state) => {
      const existing = state.windows[windowId]
      if (existing === undefined) return state
      return {
        windows: {
          ...state.windows,
          [windowId]: { ...existing, ...updates },
        },
      }
    }),

  setWindowOrder: (order) => set({ windowOrder: order }),
})
