import type { AdvisorWindow } from '@/types'
import type { SessionFile, SessionWindow } from './session-types'
import { useStore } from '@/store'

/**
 * Restores app state from a session file.
 * Each window loads independently — missing personas/keys show errors
 * rather than failing the entire session.
 */
export function restoreSession(session: SessionFile): void {
  const state = useStore.getState()

  // Clear existing state before restoring
  for (const windowId of state.windowOrder) {
    state.removeWindow(windowId)
  }
  state.setMessages([])
  state.resetQueue()
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
}

/**
 * Converts a session window back to an AdvisorWindow,
 * handling missing personas and keys gracefully.
 */
function sessionWindowToAdvisor(
  sw: SessionWindow,
  state: ReturnType<typeof useStore.getState>,
): AdvisorWindow {
  // Check if persona still exists
  const persona = state.personas.find((p) => p.id === sw.personaId)
  const personaError = persona === undefined
    ? `Persona "${sw.personaLabel}" not found. Select a replacement.`
    : null

  // Check if key still exists
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
 * Saves a session file via the IPC bridge.
 */
export async function saveSessionFile(
  session: SessionFile,
): Promise<void> {
  const api = getConsiliumAPI()
  if (api === undefined) {
    throw new Error('File system access not available')
  }

  const userDataPath = await api.getUserDataPath()
  const sessionsDir = `${userDataPath}/sessions`
  const filePath = `${sessionsDir}/${session.id}.council`
  const content = JSON.stringify(session, null, 2)

  // Write via env file API for now — this should use a dedicated write-file IPC handler
  // For proper implementation, we'd add a writeFile handler to the preload bridge
  await writeFileViaIPC(filePath, content)
}

/**
 * Lists available session files.
 */
export async function listSessions(): Promise<readonly string[]> {
  const api = getConsiliumAPI()
  if (api === undefined) return []

  const userDataPath = await api.getUserDataPath()
  const sessionsDir = `${userDataPath}/sessions`

  // This would need a readDir IPC handler
  // For now, return empty — will be implemented with proper IPC
  return []
}

function getConsiliumAPI(): ConsiliumAPIMinimal | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as { consiliumAPI?: ConsiliumAPIMinimal }).consiliumAPI
}

interface ConsiliumAPIMinimal {
  getUserDataPath(): Promise<string>
}

async function writeFileViaIPC(
  _filePath: string,
  _content: string,
): Promise<void> {
  // TODO: Implement IPC handler for writing session files
  // The actual implementation would use:
  // ipcRenderer.invoke('write-session-file', filePath, content)
  throw new Error('Session file writing not yet implemented — IPC handler needed')
}
