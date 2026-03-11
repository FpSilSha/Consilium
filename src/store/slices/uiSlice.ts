import type { StateCreator } from 'zustand'
import type { UIMode } from '@/features/chat/ChatView'

export interface UISlice {
  readonly uiMode: UIMode
  readonly sessionInstructions: string
  setUIMode: (mode: UIMode) => void
  setSessionInstructions: (instructions: string) => void
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
  uiMode: 'gui',
  sessionInstructions: '',

  setUIMode: (mode) => set({ uiMode: mode }),

  setSessionInstructions: (instructions) => set({ sessionInstructions: instructions }),
})
