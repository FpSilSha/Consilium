import type { StateCreator } from 'zustand'
import type { TurnMode, QueueCard } from '@/types'

export interface TurnSlice {
  readonly turnMode: TurnMode
  readonly queue: readonly QueueCard[]
  readonly isPaused: boolean
  readonly isRunning: boolean
  readonly activeCardIds: readonly string[]
  /** Rounds remaining. 0 = infinite (run until paused/stopped). */
  readonly loopCount: number
  /** Total rounds completed in this run. */
  readonly roundsCompleted: number
  setTurnMode: (mode: TurnMode) => void
  setQueue: (queue: readonly QueueCard[]) => void
  addToQueue: (card: QueueCard) => void
  removeFromQueue: (cardId: string) => void
  moveInQueue: (cardId: string, toIndex: number) => void
  duplicateCard: (cardId: string) => void
  skipCard: (cardId: string) => void
  unskipCard: (cardId: string) => void
  setCardStatus: (cardId: string, status: QueueCard['status'], errorLabel?: string) => void
  addActiveCard: (cardId: string) => void
  removeActiveCard: (cardId: string) => void
  setPaused: (paused: boolean) => void
  setIsRunning: (running: boolean) => void
  setLoopCount: (count: number) => void
  resetQueue: () => void
}

export const createTurnSlice: StateCreator<TurnSlice> = (set) => ({
  turnMode: 'sequential',
  queue: [],
  isPaused: false,
  isRunning: false,
  activeCardIds: [],
  loopCount: 0,
  roundsCompleted: 0,

  setTurnMode: (mode) => set({ turnMode: mode }),

  setQueue: (queue) => set({ queue }),

  addToQueue: (card) =>
    set((state) => ({
      queue: [...state.queue, card],
    })),

  removeFromQueue: (cardId) =>
    set((state) => ({
      queue: state.queue.filter((c) => c.id !== cardId),
      activeCardIds: state.activeCardIds.filter((id) => id !== cardId),
    })),

  moveInQueue: (cardId, toIndex) =>
    set((state) => {
      const fromIndex = state.queue.findIndex((c) => c.id === cardId)
      if (fromIndex === -1) return state
      // Don't allow moving the active card
      if (state.queue[fromIndex]?.status === 'active') return state

      const without = [...state.queue.slice(0, fromIndex), ...state.queue.slice(fromIndex + 1)]
      const card = state.queue[fromIndex]
      if (card === undefined) return state
      const reinserted = [...without.slice(0, toIndex), card, ...without.slice(toIndex)]
      return { queue: reinserted }
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
      return {
        queue: [...state.queue.slice(0, insertIndex), duplicate, ...state.queue.slice(insertIndex)],
      }
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

  unskipCard: (cardId) =>
    set((state) => {
      const card = state.queue.find((c) => c.id === cardId)
      if (card === undefined || card.status !== 'skipped') return state

      const withoutCard = state.queue.filter((c) => c.id !== cardId)
      // Find insert position: after the last waiting card in the filtered queue
      const lastWaitingIndex = withoutCard.reduce(
        (acc, c, i) => (c.status === 'waiting' ? i : acc),
        -1,
      )
      const insertAt = lastWaitingIndex === -1 ? 0 : lastWaitingIndex + 1
      const restored: QueueCard = { ...card, status: 'waiting' }
      return {
        queue: [...withoutCard.slice(0, insertAt), restored, ...withoutCard.slice(insertAt)],
      }
    }),

  setCardStatus: (cardId, status, errorLabel) =>
    set((state) => ({
      queue: state.queue.map((c) =>
        c.id === cardId
          ? { ...c, status, errorLabel: errorLabel ?? c.errorLabel }
          : c,
      ),
    })),

  addActiveCard: (cardId) =>
    set((state) => ({
      activeCardIds: state.activeCardIds.includes(cardId)
        ? state.activeCardIds
        : [...state.activeCardIds, cardId],
    })),

  removeActiveCard: (cardId) =>
    set((state) => ({
      activeCardIds: state.activeCardIds.filter((id) => id !== cardId),
    })),

  setPaused: (paused) => set({ isPaused: paused }),

  setIsRunning: (running) => set({ isRunning: running }),

  setLoopCount: (count) => set({ loopCount: Math.max(0, count) }),

  resetQueue: () =>
    set((state) => ({
      queue: state.queue
        .filter((c) => c.status !== 'errored' && c.status !== 'skipped')
        .map((c) => ({ ...c, status: 'waiting' as const, errorLabel: null })),
      activeCardIds: [],
      isRunning: false,
      isPaused: false,
    })),
})
