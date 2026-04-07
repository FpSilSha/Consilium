import type { StateCreator } from 'zustand'
import type { SessionDocument } from '@/features/documents/types'

export interface CompileModelConfig {
  readonly provider: string
  readonly model: string
  readonly keyId: string
}

export interface DocumentsSlice {
  /**
   * Documents currently referenced by this session, in display order
   * (newest first). Resolved from the global store at session load time —
   * missing files are silently dropped (graceful degradation).
   */
  readonly documents: readonly SessionDocument[]

  /**
   * The IDs of documents this session references. Persisted in the session
   * file. Source of truth for what the session "owns" — `documents` is
   * derived from this list at load time.
   */
  readonly documentIds: readonly string[]

  /** Whether the documents sidebar section is expanded. UI-only state. */
  readonly documentsPanelOpen: boolean

  /**
   * In-flight compile state. While a document is being generated, the
   * partial content streams here so the sidebar can show a "drafting"
   * entry. Cleared when the compile finalizes (or fails).
   */
  readonly draftCompile: {
    readonly title: string
    readonly content: string
    readonly modelName: string
    readonly status: 'streaming' | 'error'
    readonly error?: string
  } | null

  /**
   * Global default model used by Compile Document when no per-call
   * override is provided. Loaded from config.json at startup, persisted
   * back via the Compile Settings modal under Edit menu.
   */
  readonly compileModelConfig: CompileModelConfig | null

  /** Hardcoded default 16384 — overridable via Edit Configuration. */
  readonly compileMaxTokens: number

  /**
   * Total cost spent on compile calls for the current session, in dollars.
   * Compile is not an advisor turn, so its cost doesn't roll into any
   * window's runningCost — this slice owns it. Counted by the budget
   * engine via getSessionTotalCost(), so it respects the session budget cap.
   */
  readonly sessionCompileCost: number

  // ── Actions ─────────────────────────────────────────────────

  /** Replaces the in-memory documents + IDs (used on session load). */
  setSessionDocuments: (docs: readonly SessionDocument[]) => void

  /** Adds a freshly compiled document to the current session. */
  addDocument: (doc: SessionDocument) => void

  /** Removes the document from this session's reference list (file untouched). */
  removeDocumentFromSession: (id: string) => void

  /** Removes from this session AND deletes the underlying file. */
  forgetDocument: (id: string) => void

  /** Toggles the sidebar section. */
  setDocumentsPanelOpen: (open: boolean) => void

  /** In-flight compile streaming hooks. */
  setDraftCompile: (draft: DocumentsSlice['draftCompile']) => void
  appendDraftCompileContent: (chunk: string) => void

  /** Global compile defaults — set by startup loader and Compile Settings modal. */
  setCompileModelConfig: (config: CompileModelConfig | null) => void
  setCompileMaxTokens: (max: number) => void

  /** Adds to the compile-cost ledger. Called when a compile finishes. */
  accumulateCompileCost: (cost: number) => void
  /** Resets the compile-cost ledger. Called on session switch. */
  resetCompileCost: () => void
}

export const createDocumentsSlice: StateCreator<DocumentsSlice> = (set) => ({
  documents: [],
  documentIds: [],
  documentsPanelOpen: true,
  draftCompile: null,
  compileModelConfig: null,
  compileMaxTokens: 16384,
  sessionCompileCost: 0,

  setSessionDocuments: (docs) =>
    set({
      documents: docs,
      documentIds: docs.map((d) => d.id),
    }),

  addDocument: (doc) =>
    set((state) => {
      // Newest first; don't duplicate an existing ID
      const filtered = state.documents.filter((d) => d.id !== doc.id)
      const next = [doc, ...filtered]
      return {
        documents: next,
        documentIds: next.map((d) => d.id),
      }
    }),

  removeDocumentFromSession: (id) =>
    set((state) => {
      const next = state.documents.filter((d) => d.id !== id)
      return {
        documents: next,
        documentIds: next.map((d) => d.id),
      }
    }),

  forgetDocument: (id) =>
    set((state) => {
      // The actual file delete is fired-and-forgotten in the UI layer
      // (via the documents:delete IPC). The store only updates state.
      const next = state.documents.filter((d) => d.id !== id)
      return {
        documents: next,
        documentIds: next.map((d) => d.id),
      }
    }),

  setDocumentsPanelOpen: (open) => set({ documentsPanelOpen: open }),

  setDraftCompile: (draft) => set({ draftCompile: draft }),

  appendDraftCompileContent: (chunk) =>
    set((state) => {
      if (state.draftCompile == null) return state
      return {
        draftCompile: {
          ...state.draftCompile,
          content: state.draftCompile.content + chunk,
        },
      }
    }),

  setCompileModelConfig: (config) => set({ compileModelConfig: config }),
  setCompileMaxTokens: (max) => set({ compileMaxTokens: max }),

  accumulateCompileCost: (cost) =>
    set((state) => ({ sessionCompileCost: state.sessionCompileCost + cost })),
  resetCompileCost: () => set({ sessionCompileCost: 0 }),
})
