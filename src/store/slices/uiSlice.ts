import type { StateCreator } from 'zustand'
import type { UIMode } from '@/features/chat/ChatView'

export interface UISlice {
  readonly uiMode: UIMode
  readonly sessionInstructions: string
  readonly configModalOpen: boolean
  setUIMode: (mode: UIMode) => void
  setSessionInstructions: (instructions: string) => void
  setConfigModalOpen: (open: boolean) => void
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
  uiMode: 'gui',
  sessionInstructions: '',
  configModalOpen: false,

  setUIMode: (mode) => set({ uiMode: mode }),

  setSessionInstructions: (instructions) => set({ sessionInstructions: instructions }),

  setConfigModalOpen: (open) => set({ configModalOpen: open }),
})
