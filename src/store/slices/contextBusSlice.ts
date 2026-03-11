import type { StateCreator } from 'zustand'
import type { Message } from '@/types'

export interface ContextBusSlice {
  readonly messages: readonly Message[]
  readonly archivedMessages: readonly Message[]
  appendMessage: (message: Message) => void
  setMessages: (messages: readonly Message[]) => void
  archiveMessages: (messages: readonly Message[]) => void
  clearMessages: () => void
}

export const createContextBusSlice: StateCreator<ContextBusSlice> = (set) => ({
  messages: [],
  archivedMessages: [],

  appendMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  setMessages: (messages) => set({ messages }),

  archiveMessages: (messages) =>
    set((state) => ({
      archivedMessages: [...state.archivedMessages, ...messages],
    })),

  clearMessages: () => set({ messages: [], archivedMessages: [] }),
})
