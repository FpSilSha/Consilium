import type { AdvisorWindow } from '@/types'
import type { SessionFile, SessionWindow, SessionMetadata } from './session-types'
import { useStore } from '@/store'
import { detectModelMismatches } from './model-mismatch'
import { setSessionLoadingFlag } from '@/app/useSessionAutoSave'

/**
 * Restores app state from a session file.
 */
export function restoreSession(session: SessionFile): void {
  const state = useStore.getState()

  // Clear existing state before restoring
  for (const windowId of state.windowOrder) {
    state.removeWindow(windowId)
  }
  state.clearMessages()
  state.setQueue([])
  state.resetBudgetWarning()
  state.setSessionBudget(0)

  // Restore messages
  state.setMessages(session.messages)
  if (session.archivedMessages.length > 0) {
    state.archiveMessages(session.archivedMessages)
  }

  // Restore turn state
  state.setTurnMode(session.turnMode)
  state.setQueue(session.queue)
  state.setSessionInstructions(session.sessionInstructions)

  // Restore windows with graceful degradation
  for (const sw of session.windows) {
    const window = sessionWindowToAdvisor(sw, state)
    state.addWindow(window)
  }

  // Set current session ID and restore custom name
  state.setCurrentSessionId(session.id)
  state.setSessionCustomName(session.name)

  // Check for model mismatches against allowed models
  const freshState = useStore.getState()
  const mismatches = detectModelMismatches(freshState.windows, freshState.allowedModels)
  if (mismatches.length > 0) {
    freshState.setPendingMismatches(mismatches)
  }
}

function sessionWindowToAdvisor(
  sw: SessionWindow,
  state: ReturnType<typeof useStore.getState>,
): AdvisorWindow {
  const persona = state.personas.find((p) => p.id === sw.personaId)
  const personaError = persona === undefined
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
    compactedSummary: null,
    bufferSize: sw.bufferSize,
  }
}

/**
 * Initializes a new session with an ID and saves an initial entry.
 * Called on app load (post-onboarding) and on "New Consilium".
 * The session appears immediately in the sidebar.
 */
export async function initializeNewSession(): Promise<void> {
  const state = useStore.getState()
  if (state.currentSessionId != null) return

  const sessionId = crypto.randomUUID()
  state.setCurrentSessionId(sessionId)
  state.setSessionCustomName(null)

  await saveCurrentSession()
}

/**
 * Builds a SessionFile from the current app state.
 */
export function buildSessionFile(): SessionFile {
  const state = useStore.getState()
  const sessionId = state.currentSessionId ?? crypto.randomUUID()

  const totalCost = state.windowOrder.reduce((sum, id) => {
    const w = state.windows[id]
    return sum + (w?.runningCost ?? 0)
  }, 0)

  // Use custom name if set, otherwise derive from first user message or advisors
  const name = state.sessionCustomName != null
    ? state.sessionCustomName
    : (() => {
        const firstUserMsg = state.messages.find((m) => m.role === 'user')
        return firstUserMsg != null
          ? firstUserMsg.content.slice(0, 40).replace(/\n/g, ' ').trim() || 'Untitled'
          : state.windowOrder.map((id) => state.windows[id]?.personaLabel).filter(Boolean).join(', ')
            || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      })()

  return {
    version: 1,
    id: sessionId,
    name,
    createdAt: state.messages[0]?.timestamp ?? Date.now(),
    updatedAt: Date.now(),
    windows: state.windowOrder
      .map((id) => state.windows[id])
      .filter((w): w is AdvisorWindow => w != null)
      .map((w): SessionWindow => ({
        id: w.id,
        provider: w.provider,
        keyId: w.keyId,
        model: w.model,
        personaId: w.personaId,
        personaLabel: w.personaLabel,
        personaFilename: '',
        accentColor: w.accentColor,
        runningCost: w.runningCost,
        isCompacted: w.isCompacted,
        bufferSize: w.bufferSize,
      })),
    messages: state.messages,
    archivedMessages: state.archivedMessages,
    queue: state.queue,
    turnMode: state.turnMode,
    sessionInstructions: state.sessionInstructions,
    totalCost,
    inputFiles: [],
    outputFiles: [],
  }
}

/**
 * Builds a session payload (id + serialized content) for synchronous saves.
 * Returns null if there's nothing to save.
 */
export function buildSessionPayload(): { readonly id: string; readonly content: string } | null {
  const state = useStore.getState()
  if (state.messages.length === 0 && state.windowOrder.length === 0) return null

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

  // Stop any active run and cancel vote streams before switching sessions
  const { isRunning } = useStore.getState()
  if (isRunning) {
    const { stopAll } = await import('@/features/turnManager')
    stopAll()
  }
  const { cancelActiveVotes } = await import('@/features/voting/vote-service')
  cancelActiveVotes()

  const content = await api.sessionLoad(id)
  if (content == null) return

  try {
    const parsed: unknown = JSON.parse(content)
    if (!isValidSessionFile(parsed)) return
    setSessionLoadingFlag(true)
    restoreSession(parsed)
    // Suppress auto-save for one render cycle after restore
    setTimeout(() => setSessionLoadingFlag(false), 100)
  } catch {
    setSessionLoadingFlag(false)
  }
}

/** Runtime shape check for session files — prevents crashes from corrupted data. */
function isValidSessionFile(data: unknown): data is SessionFile {
  if (data == null || typeof data !== 'object') return false
  const s = data as Record<string, unknown>
  return (
    s['version'] === 1 &&
    typeof s['id'] === 'string' &&
    typeof s['name'] === 'string' &&
    typeof s['turnMode'] === 'string' &&
    typeof s['sessionInstructions'] === 'string' &&
    typeof s['totalCost'] === 'number' &&
    Array.isArray(s['messages']) &&
    Array.isArray(s['windows']) &&
    Array.isArray(s['queue']) &&
    Array.isArray(s['archivedMessages']) &&
    typeof s['createdAt'] === 'number' &&
    typeof s['updatedAt'] === 'number' &&
    Array.isArray(s['inputFiles']) &&
    Array.isArray(s['outputFiles'])
  )
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
