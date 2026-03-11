import type { AdvisorWindow } from '@/types'
import type { SessionFile, SessionWindow, SessionMetadata } from './session-types'
import { useStore } from '@/store'

/**
 * Serializes the current app state into a .council session file format.
 */
export function serializeSession(
  sessionId: string,
  sessionName: string,
  existingCreatedAt?: number,
): SessionFile {
  const state = useStore.getState()

  const windows: readonly SessionWindow[] = state.windowOrder
    .map((id) => {
      const w = state.windows[id]
      if (w === undefined) return null
      const persona = state.personas.find((p) => p.id === w.personaId)
      return windowToSession(w, persona?.filePath ?? '')
    })
    .filter((w): w is SessionWindow => w !== null)

  const totalCost = state.windowOrder.reduce((sum, id) => {
    const w = state.windows[id]
    return sum + (w?.runningCost ?? 0)
  }, 0)

  return {
    version: 1,
    id: sessionId,
    name: sessionName,
    createdAt: existingCreatedAt ?? Date.now(),
    updatedAt: Date.now(),
    windows,
    messages: [...state.messages],
    archivedMessages: [...state.archivedMessages],
    queue: [...state.queue],
    turnMode: state.turnMode,
    sessionInstructions: state.sessionInstructions,
    totalCost,
    inputFiles: [],
    outputFiles: [],
  }
}

/**
 * Validates and parses a .council JSON string.
 */
export function deserializeSession(json: string): SessionFile | null {
  try {
    const data: unknown = JSON.parse(json)
    if (!isSessionFile(data)) return null
    return data
  } catch {
    return null
  }
}

/**
 * Extracts metadata from a session file without full deserialization.
 */
export function extractMetadata(session: SessionFile): SessionMetadata {
  return {
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    windowCount: session.windows.length,
    messageCount: session.messages.length,
    totalCost: session.totalCost,
  }
}

function windowToSession(
  w: AdvisorWindow,
  personaFilename: string,
): SessionWindow {
  return {
    id: w.id,
    provider: w.provider,
    keyId: w.keyId,
    model: w.model,
    personaId: w.personaId,
    personaLabel: w.personaLabel,
    personaFilename,
    accentColor: w.accentColor,
    runningCost: w.runningCost,
    isCompacted: w.isCompacted,
    bufferSize: w.bufferSize,
  }
}

function isSessionFile(data: unknown): data is SessionFile {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  if (
    obj['version'] !== 1 ||
    typeof obj['id'] !== 'string' ||
    typeof obj['name'] !== 'string' ||
    typeof obj['createdAt'] !== 'number' ||
    !Array.isArray(obj['windows']) ||
    !Array.isArray(obj['messages'])
  ) {
    return false
  }

  // Validate window shapes
  const windows = obj['windows'] as unknown[]
  for (const w of windows) {
    if (typeof w !== 'object' || w === null) return false
    const win = w as Record<string, unknown>
    if (typeof win['id'] !== 'string' || typeof win['model'] !== 'string') return false
  }

  // Validate message shapes
  const messages = obj['messages'] as unknown[]
  for (const m of messages) {
    if (typeof m !== 'object' || m === null) return false
    const msg = m as Record<string, unknown>
    if (typeof msg['id'] !== 'string' || typeof msg['role'] !== 'string' || typeof msg['content'] !== 'string') return false
  }

  return true
}
