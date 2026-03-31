import type { StateCreator } from 'zustand'
import type { UIMode } from '@/features/chat/ChatView'
import type { ModelMismatch } from '@/features/sessions/model-mismatch'

export interface UISlice {
  readonly uiMode: UIMode
  readonly sessionInstructions: string
  readonly configModalOpen: boolean
  readonly pendingMismatches: readonly ModelMismatch[]
  setUIMode: (mode: UIMode) => void
  setSessionInstructions: (instructions: string) => void
  setConfigModalOpen: (open: boolean) => void
  setPendingMismatches: (mismatches: readonly ModelMismatch[]) => void
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
  uiMode: 'gui',
  sessionInstructions: '',
  configModalOpen: false,
  pendingMismatches: [],

  setUIMode: (mode) => set({ uiMode: mode }),

  setSessionInstructions: (instructions) => set({ sessionInstructions: instructions }),

  setConfigModalOpen: (open) => set({ configModalOpen: open }),

  setPendingMismatches: (mismatches) => set({ pendingMismatches: mismatches }),
})
