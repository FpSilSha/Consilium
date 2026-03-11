import type { StateCreator } from 'zustand'
import type { TurnMode, QueueCard } from '@/types'

export interface TurnSlice {
  readonly turnMode: TurnMode
  readonly queue: readonly QueueCard[]
  readonly isPaused: boolean
  readonly isRunning: boolean
  readonly activeCardId: string | null
  setTurnMode: (mode: TurnMode) => void
  setQueue: (queue: readonly QueueCard[]) => void
  addToQueue: (card: QueueCard) => void
  removeFromQueue: (cardId: string) => void
  moveInQueue: (cardId: string, toIndex: number) => void
  duplicateCard: (cardId: string) => void
  skipCard: (cardId: string) => void
  setCardStatus: (cardId: string, status: QueueCard['status'], errorLabel?: string) => void
  setActiveCard: (cardId: string | null) => void
  setPaused: (paused: boolean) => void
  setIsRunning: (running: boolean) => void
  resetQueue: () => void
}

export const createTurnSlice: StateCreator<TurnSlice> = (set) => ({
  turnMode: 'sequential',
  queue: [],
  isPaused: false,
  isRunning: false,
  activeCardId: null,

  setTurnMode: (mode) => set({ turnMode: mode }),

  setQueue: (queue) => set({ queue }),

  addToQueue: (card) =>
    set((state) => ({
      queue: [...state.queue, card],
    })),

  removeFromQueue: (cardId) =>
    set((state) => ({
      queue: state.queue.filter((c) => c.id !== cardId),
      activeCardId: state.activeCardId === cardId ? null : state.activeCardId,
    })),

  moveInQueue: (cardId, toIndex) =>
    set((state) => {
      const fromIndex = state.queue.findIndex((c) => c.id === cardId)
      if (fromIndex === -1) return state
      // Don't allow moving the active card
      if (state.queue[fromIndex]?.status === 'active') return state

      const newQueue = [...state.queue]
      const [card] = newQueue.splice(fromIndex, 1)
      if (card === undefined) return state
      newQueue.splice(toIndex, 0, card)
      return { queue: newQueue }
    }),

  duplicateCard: (cardId) =>
    set((state) => {
      const original = state.queue.find((c) => c.id === cardId)
      if (original === undefined) return state
      // No duplicates in parallel mode
      if (state.turnMode === 'parallel') return state

      const duplicate: QueueCard = {
        ...original,
        id: `${original.windowId}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
        status: 'waiting',
        errorLabel: null,
      }
      const insertIndex = state.queue.findIndex((c) => c.id === cardId) + 1
      const newQueue = [...state.queue]
      newQueue.splice(insertIndex, 0, duplicate)
      return { queue: newQueue }
    }),

  skipCard: (cardId) =>
    set((state) => {
      const cardIndex = state.queue.findIndex((c) => c.id === cardId)
      if (cardIndex === -1) return state
      const card = state.queue[cardIndex]!
      if (card.status === 'active') return state

      const updated: QueueCard = { ...card, status: 'skipped' }
      const withoutCard = state.queue.filter((c) => c.id !== cardId)
      return { queue: [...withoutCard, updated] }
    }),

  setCardStatus: (cardId, status, errorLabel) =>
    set((state) => ({
      queue: state.queue.map((c) =>
        c.id === cardId
          ? { ...c, status, errorLabel: errorLabel ?? c.errorLabel }
          : c,
      ),
    })),

  setActiveCard: (cardId) => set({ activeCardId: cardId }),

  setPaused: (paused) => set({ isPaused: paused }),

  setIsRunning: (running) => set({ isRunning: running }),

  resetQueue: () =>
    set((state) => ({
      queue: state.queue
        .filter((c) => c.status !== 'errored' && c.status !== 'skipped')
        .map((c) => ({ ...c, status: 'waiting' as const, errorLabel: null })),
      activeCardId: null,
      isRunning: false,
      isPaused: false,
    })),
})
