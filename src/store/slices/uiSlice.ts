import type { StateCreator } from 'zustand'
import type { UIMode } from '@/features/chat/ChatView'
import type { ModelMismatch } from '@/features/sessions/model-mismatch'

export interface ErrorLogEntry {
  readonly id: string
  readonly timestamp: number
  readonly advisorLabel: string
  readonly accentColor: string
  readonly message: string
}

export interface UISlice {
  readonly uiMode: UIMode
  readonly sessionInstructions: string
  readonly configModalOpen: boolean
  readonly pendingMismatches: readonly ModelMismatch[]
  readonly errorLog: readonly ErrorLogEntry[]
  readonly currentSessionId: string | null
  setUIMode: (mode: UIMode) => void
  setSessionInstructions: (instructions: string) => void
  setConfigModalOpen: (open: boolean) => void
  setPendingMismatches: (mismatches: readonly ModelMismatch[]) => void
  addErrorLog: (entry: ErrorLogEntry) => void
  clearErrorLog: () => void
  setCurrentSessionId: (id: string | null) => void
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
  uiMode: 'gui',
  sessionInstructions: '',
  configModalOpen: false,
  pendingMismatches: [],
  errorLog: [],
  currentSessionId: null,

  setUIMode: (mode) => set({ uiMode: mode }),

  setSessionInstructions: (instructions) => set({ sessionInstructions: instructions }),

  setConfigModalOpen: (open) => set({ configModalOpen: open }),

  setPendingMismatches: (mismatches) => set({ pendingMismatches: mismatches }),

  addErrorLog: (entry) =>
    set((state) => ({ errorLog: [...state.errorLog, entry] })),

  clearErrorLog: () => set({ errorLog: [] }),

  setCurrentSessionId: (id) => set({ currentSessionId: id }),
})
