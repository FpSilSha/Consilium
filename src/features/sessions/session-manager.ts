import type { AdvisorWindow } from '@/types'
import type { SessionFile, SessionWindow, SessionMetadata } from './session-types'
import { useStore } from '@/store'
import { detectModelMismatches } from './model-mismatch'
import { duringSessionRestore } from './session-loading'
import { isValidSessionFile } from './session-validation'
import { sameSessionSnapshot, sessionSnapshot } from './session-snapshot'

let loadSequence = 0
let sessionGeneration = 0

/**
 * Restores app state from a session file.
 */
export function restoreSession(session: SessionFile): void {
  if (!isValidSessionFile(session)) return
  loadSequence++
  sessionGeneration++
  duringSessionRestore(() => applySession(session))
}

function applySession(session: SessionFile): void {
  const state = useStore.getState()

  // Force-clear streaming state on all windows before removing them —
  // catches streams from @mentions and compile-document that stopAll doesn't track
  for (const windowId of state.windowOrder) {
    state.updateWindow(windowId, { isStreaming: false, streamContent: '' })
  }

  // Clear existing state before restoring
  for (const windowId of state.windowOrder) {
    state.removeWindow(windowId)
  }
  state.clearMessages()
  state.setQueue([])
  state.resetBudgetWarning()
  state.setSessionBudget(session.sessionBudget ?? 0)
  state.setLoopCount(session.loopCount ?? 0)

  // Restore messages
  state.setMessages(session.messages)
  if (session.archivedMessages.length > 0) {
    state.archiveMessages(session.archivedMessages)
  }

  // Restore turn state
  state.setTurnMode(session.turnMode)
  state.setQueue(session.queue)
  state.setSessionInstructions(session.sessionInstructions ?? '')

  // Restore auto-compaction settings. Precedence:
  //   1. Session file's explicit value (if present)
  //   2. Global default from store (if set)
  //   3. Off
  if (session.autoCompaction != null) {
    state.setAutoCompaction(session.autoCompaction.enabled, session.autoCompaction.config)
  } else if (state.globalAutoCompactionEnabled && state.globalAutoCompactionConfig !== null) {
    state.setAutoCompaction(true, state.globalAutoCompactionConfig)
  } else {
    state.setAutoCompaction(false, null)
  }

  // Clear any in-flight compile draft + previous compile cost ledger from
  // the prior session. The compile controller is aborted explicitly in
  // loadSession before this point, so any callback that fires after will
  // be discarded by its sessionId guard.
  state.setDraftCompile(null)
  // Restore the persisted compile cost (or 0 if absent — older session
  // files won't have this field). resetCompileCost first so a missing
  // field cleanly drops to 0.
  state.resetCompileCost()
  if (typeof session.sessionCompileCost === 'number' && session.sessionCompileCost > 0) {
    state.accumulateCompileCost(session.sessionCompileCost)
  }

  // CRITICAL ORDERING: setCurrentSessionId MUST happen before
  // restoreDocuments, because restoreDocuments runs synchronously up to
  // its first await and that synchronous portion includes the sessionId
  // check. If currentSessionId is still the previous session here, the
  // check fails on the first iteration and no documents load.
  state.setCurrentSessionId(session.id)
  state.setSessionCustomName(session.name)

  // Restore documents. The session holds a list of IDs; we fetch each doc
  // by ID via the documents:load IPC. Missing files are silently dropped —
  // no crash, no migration. Fired async so session restore isn't blocked.
  // restoreDocuments captures the current sessionId at start and bails if
  // the session has changed underneath it before all loads complete.
  state.setSessionDocumentReferences(session.documentIds ?? [])
  void restoreDocuments(session.documentIds ?? [], session.id, sessionGeneration)

  // Restore windows with graceful degradation
  for (const sw of session.windows) {
    const window = sessionWindowToAdvisor(sw, state)
    state.addWindow(window)
  }

  // Check for model mismatches against allowed models
  const freshState = useStore.getState()
  const mismatches = detectModelMismatches(freshState.windows, freshState.allowedModels)
  freshState.setPendingMismatches(mismatches)
}

function sessionWindowToAdvisor(
  sw: SessionWindow,
  state: ReturnType<typeof useStore.getState>,
): AdvisorWindow {
  // Empty personaId is intentional "No Persona" — not an error.
  const persona = state.personas.find((p) => p.id === sw.personaId)
  const personaError = sw.personaId !== '' && persona === undefined
    ? `Persona "${sw.personaLabel}" not found. Select a replacement.`
    : null

  const key = state.keys.find((k) => k.id === sw.keyId)
  const keyError = key === undefined
    ? `API key for ${sw.provider} not found. Configure a key.`
    : null

  const error = personaError ?? keyError ?? null

  return {
    id: sw.id,
    provider: (sw.provider as AdvisorWindow['provider']) ?? 'anthropic',
    keyId: sw.keyId,
    model: sw.model,
    personaId: sw.personaId,
    personaLabel: sw.personaLabel,
    accentColor: sw.accentColor,
    runningCost: sw.runningCost,
    isStreaming: false,
    streamContent: '',
    error,
    isCompacted: sw.isCompacted,
    compactedSummary: sw.compactedSummary ?? null,
    bufferSize: sw.bufferSize,
  }
}

/**
 * Resolves session document IDs to full SessionDocument objects via the
 * documents:load IPC. Missing documents (deleted or never persisted) are
 * silently skipped — graceful degradation per the storage design.
 *
 * `expectedSessionId` is captured at the call site (restoreSession) and
 * used to bail out if the user switches sessions while async loads are
 * in flight. Without this guard, a slow restore could overwrite the
 * newer session's document list with stale data.
 */
async function restoreDocuments(
  ids: readonly string[],
  expectedSessionId: string,
  expectedGeneration: number,
): Promise<void> {
  const state = useStore.getState()

  if (ids.length === 0) {
    state.setSessionDocuments([])
    return
  }

  const api = (typeof window === 'undefined' ? undefined : window as { consiliumAPI?: { documentsLoad: (id: string) => Promise<Record<string, unknown> | null> } })?.consiliumAPI
  if (api?.documentsLoad == null) {
    state.setSessionDocuments([])
    return
  }

  const loaded: import('@/features/documents/types').SessionDocument[] = []
  for (const id of ids) {
    // Bail mid-loop if session changed — don't waste IPC calls on a
    // session the user has already abandoned.
    if (sessionGeneration !== expectedGeneration || useStore.getState().currentSessionId !== expectedSessionId) return

    try {
      const doc = await api.documentsLoad(id)
      if (doc != null && isValidSessionDocument(doc)) {
        loaded.push(doc as unknown as import('@/features/documents/types').SessionDocument)
      }
    } catch {
      // Skip — corrupted or missing doc files don't crash session restore
    }
  }

  // Final check before commit — the awaits above may have spanned a session switch.
  if (sessionGeneration !== expectedGeneration || useStore.getState().currentSessionId !== expectedSessionId) return
  const current = useStore.getState()
  // Respect documents added or removed while disk reads were in flight.
  const byId = new Map([...loaded, ...current.documents].map((doc) => [doc.id, doc]))
  state.setSessionDocuments(current.documentIds.flatMap((id) => {
    const doc = byId.get(id)
    return doc === undefined ? [] : [doc]
  }))
}

function isValidSessionDocument(d: Record<string, unknown>): boolean {
  return (
    typeof d['id'] === 'string' && d['id'] !== '' &&
    typeof d['title'] === 'string' &&
    typeof d['content'] === 'string' &&
    typeof d['provider'] === 'string' &&
    typeof d['model'] === 'string' &&
    typeof d['modelName'] === 'string' &&
    typeof d['cost'] === 'number' &&
    typeof d['createdAt'] === 'number'
  )
}

/** Prevents concurrent initializeNewSession calls from double-creating. */
let initInProgress = false

/**
 * Initializes a new session with an ID and saves an initial entry.
 * Called on app load (post-onboarding) and on "New Consilium".
 * The session appears immediately in the sidebar.
 */
export async function initializeNewSession(): Promise<void> {
  if (initInProgress) return
  const state = useStore.getState()
  if (state.currentSessionId != null) return
  initInProgress = true
  try {
    loadSequence++
    sessionGeneration++
    const sessionId = crypto.randomUUID()
    state.setCurrentSessionId(sessionId)
    state.setSessionCustomName(null)
    state.setSessionBudget(0)
    state.setLoopCount(0)

    // New sessions inherit the global auto-compaction default.
    // If global hasn't loaded from config.json yet (keys still loading),
    // useStartupAutoCompaction will patch the current session once it runs.
    state.setAutoCompaction(
      state.globalAutoCompactionEnabled && state.globalAutoCompactionConfig !== null,
      state.globalAutoCompactionConfig,
    )

    // Fresh sessions start with no document references and a zero compile-cost ledger
    state.setSessionDocuments([])
    state.resetCompileCost()
    state.setDraftCompile(null)

    await saveCurrentSession()
  } finally {
    initInProgress = false
  }
}

/**
 * Builds a SessionFile from the current app state.
 */
export function buildSessionFile(): SessionFile {
  const snapshot = sessionSnapshot(useStore.getState())
  const {
    currentSessionId, sessionCustomName, autoCompactionEnabled, autoCompactionConfig,
    ...persisted
  } = snapshot
  const firstUserMsg = snapshot.messages.find((m) => m.role === 'user')
  const name = sessionCustomName ?? (
    firstUserMsg != null
      ? firstUserMsg.content.slice(0, 40).replace(/\n/g, ' ').trim() || 'Untitled'
      : snapshot.windows.map((w) => w.personaLabel).filter(Boolean).join(', ')
        || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  )

  return {
    ...persisted,
    version: 2,
    id: currentSessionId ?? crypto.randomUUID(),
    name,
    createdAt: snapshot.messages[0]?.timestamp ?? Date.now(),
    updatedAt: Date.now(),
    totalCost: snapshot.windows.reduce((sum, w) => sum + w.runningCost, 0) + snapshot.sessionCompileCost,
    inputFiles: [],
    outputFiles: [],
    autoCompaction: { enabled: autoCompactionEnabled, config: autoCompactionConfig },
  }
}

/**
 * Builds a session payload (id + serialized content) for synchronous saves.
 * Returns null if there's nothing to save.
 */
export function buildSessionPayload(): { readonly id: string; readonly content: string } | null {
  const state = useStore.getState()
  if (state.currentSessionId === null && state.messages.length === 0 && state.windowOrder.length === 0) return null

  const session = buildSessionFile()

  if (state.currentSessionId == null) {
    state.setCurrentSessionId(session.id)
  }

  return { id: session.id, content: JSON.stringify(session) }
}

/**
 * Saves the current session to disk via IPC.
 */
export async function saveCurrentSession(): Promise<void> {
  const api = getSessionAPI()
  if (api == null) return

  const session = buildSessionFile()

  // Ensure the store has the session ID
  const state = useStore.getState()
  if (state.currentSessionId == null) {
    state.setCurrentSessionId(session.id)
  }

  await api.sessionSave(session.id, JSON.stringify(session))
}

/**
 * Lists available sessions from disk.
 */
export async function listSessions(): Promise<readonly SessionMetadata[]> {
  const api = getSessionAPI()
  if (api == null) return []

  const entries = await api.sessionList()
  return entries.map((e) => ({
    id: e.id,
    name: e.name,
    createdAt: 0,
    updatedAt: e.updatedAt,
    windowCount: 0,
    messageCount: 0,
    totalCost: 0,
  }))
}

/**
 * Loads a session from disk and restores it.
 * Stops any active run before switching.
 */
export async function loadSession(id: string): Promise<void> {
  const api = getSessionAPI()
  if (api == null) return
  const request = ++loadSequence
  // Assign an ID to any unsaved conversation before tracking the source.
  // Otherwise its first save would look like a user-initiated session switch.
  const source = useStore.getState()
  if (source.currentSessionId === null && (source.messages.length > 0 || source.windowOrder.length > 0)) {
    source.setCurrentSessionId(crypto.randomUUID())
  }
  const sourceId = useStore.getState().currentSessionId
  const stillCurrent = () => request === loadSequence && useStore.getState().currentSessionId === sourceId

  const content = await api.sessionLoad(id)
  if (content === null || !stillCurrent()) return
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return
  }
  if (!isValidSessionFile(parsed) || parsed.id !== id) return

  const [{ stopAll }, { cancelActiveVotes }] = await Promise.all([
    import('@/features/turnManager'),
    import('@/features/voting/vote-service'),
  ])
  if (!stillCurrent()) return
  stopAll()
  cancelActiveVotes()

  // Flush outgoing edits before changing IDs. If saving fails, retain the
  // current session and propagate the error. A newer selection invalidates
  // this load, including while disk writes are pending.
  while (stillCurrent()) {
    const beforeSave = sessionSnapshot(useStore.getState())
    if (sourceId !== null || beforeSave.messages.length > 0 || beforeSave.windows.length > 0) {
      await saveCurrentSession()
    }
    if (!stillCurrent()) return
    if (sameSessionSnapshot(beforeSave, sessionSnapshot(useStore.getState()))) break
  }
  if (stillCurrent()) restoreSession(parsed)
}

/**
 * Renames a session. If it's the current session, updates the store.
 * Otherwise loads, renames, and re-saves the session file.
 */
export async function renameSession(id: string, newName: string): Promise<void> {
  const state = useStore.getState()

  // Current session — just update the store, auto-save will persist it
  if (id === state.currentSessionId) {
    state.setSessionCustomName(newName)
    await saveCurrentSession()
    return
  }

  // Historical session — load, rename, re-save
  const api = getSessionAPI()
  if (api == null) return

  const content = await api.sessionLoad(id)
  if (content == null) return

  try {
    const session = JSON.parse(content) as Record<string, unknown>
    await api.sessionSave(id, JSON.stringify({ ...session, name: newName }))
  } catch { /* non-fatal */ }
}

/**
 * Deletes a session from disk.
 */
export async function deleteSession(id: string): Promise<void> {
  const api = getSessionAPI()
  if (api == null) return
  await api.sessionDelete(id)
}

function getSessionAPI() {
  if (typeof window === 'undefined') return null
  const w = window as { consiliumAPI?: {
    sessionSave(id: string, content: string): Promise<void>
    sessionLoad(id: string): Promise<string | null>
    sessionList(): Promise<readonly { id: string; name: string; updatedAt: number }[]>
    sessionDelete(id: string): Promise<void>
  } }
  return w.consiliumAPI ?? null
}
