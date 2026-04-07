import type { StateCreator } from 'zustand'
import type { UIMode } from '@/features/chat/ChatView'
import type { ModelMismatch } from '@/features/sessions/model-mismatch'

export interface ErrorLogEntry {
  readonly id: string
  readonly timestamp: number
  readonly advisorLabel: string
  readonly accentColor: string
  readonly message: string
  readonly provider?: string
  readonly model?: string
}

export interface AutoCompactionConfig {
  readonly provider: string
  readonly model: string
  readonly keyId: string
}

export interface UISlice {
  readonly uiMode: UIMode
  readonly sessionInstructions: string
  readonly configModalOpen: boolean
  readonly pendingMismatches: readonly ModelMismatch[]
  readonly errorLog: readonly ErrorLogEntry[]
  readonly currentSessionId: string | null
  readonly sessionCustomName: string | null
  readonly autoRetryTransient: boolean
  /** When true, auto-compaction sweeps run after each turn. Off by default. */
  readonly autoCompactionEnabled: boolean
  /** The user-selected model to use for auto-compaction summarization. */
  readonly autoCompactionConfig: AutoCompactionConfig | null
  /** Global default — applied to new sessions. Persisted to config.json. */
  readonly globalAutoCompactionEnabled: boolean
  readonly globalAutoCompactionConfig: AutoCompactionConfig | null
  /** Set when startup check finds the global config's key/model unavailable. */
  readonly autoCompactionWarning: string | null
  setUIMode: (mode: UIMode) => void
  setSessionInstructions: (instructions: string) => void
  setConfigModalOpen: (open: boolean) => void
  setPendingMismatches: (mismatches: readonly ModelMismatch[]) => void
  addErrorLog: (entry: ErrorLogEntry) => void
  clearErrorLog: () => void
  setCurrentSessionId: (id: string | null) => void
  setSessionCustomName: (name: string | null) => void
  setAutoRetryTransient: (enabled: boolean) => void
  setAutoCompaction: (enabled: boolean, config: AutoCompactionConfig | null) => void
  setGlobalAutoCompaction: (enabled: boolean, config: AutoCompactionConfig | null) => void
  setAutoCompactionWarning: (warning: string | null) => void
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
  uiMode: 'gui',
  sessionInstructions: '',
  configModalOpen: false,
  pendingMismatches: [],
  errorLog: [],
  currentSessionId: null,
  sessionCustomName: null,
  autoRetryTransient: false,
  autoCompactionEnabled: false,
  autoCompactionConfig: null,
  globalAutoCompactionEnabled: false,
  globalAutoCompactionConfig: null,
  autoCompactionWarning: null,

  setUIMode: (mode) => set({ uiMode: mode }),

  setSessionInstructions: (instructions) => set({ sessionInstructions: instructions }),

  setConfigModalOpen: (open) => set({ configModalOpen: open }),

  setPendingMismatches: (mismatches) => set({ pendingMismatches: mismatches }),

  addErrorLog: (entry) =>
    set((state) => {
      const updated = [...state.errorLog, entry]
      return { errorLog: updated.length > 100 ? updated.slice(updated.length - 100) : updated }
    }),

  clearErrorLog: () => set({ errorLog: [] }),

  setCurrentSessionId: (id) => set({ currentSessionId: id }),

  setSessionCustomName: (name) => set({ sessionCustomName: name }),

  setAutoRetryTransient: (enabled) => set({ autoRetryTransient: enabled }),

  setAutoCompaction: (enabled, config) =>
    set({ autoCompactionEnabled: enabled, autoCompactionConfig: config }),

  setGlobalAutoCompaction: (enabled, config) =>
    set({ globalAutoCompactionEnabled: enabled, globalAutoCompactionConfig: config }),

  setAutoCompactionWarning: (warning) => set({ autoCompactionWarning: warning }),
})
