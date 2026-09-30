import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/store'
import {
  buildSessionFile, getSessionGeneration, initializeNewSession, restoreSession, saveCurrentSession,
} from './session-manager'
import { isValidSessionFile } from './session-validation'

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
  vi.stubGlobal('window', { consiliumAPI: { sessionSave: vi.fn(async () => {}) } })
})
afterEach(() => vi.unstubAllGlobals())

describe('local-agent persistence contract', () => {
  it.each(['subscription', 'api', undefined] as const)('preserves %s billing across a saved-session round trip', (billing) => {
    const costMetadata = {
      inputTokens: 12, outputTokens: 34, estimatedCost: 0, isEstimate: false,
      ...(billing === undefined ? {} : { billing }),
    }
    const message = {
      id: 'message', role: 'assistant' as const, content: 'Reply', personaLabel: 'Advisor',
      timestamp: 1000, windowId: 'advisor', costMetadata,
    }
    useStore.getState().setCurrentSessionId('saved')
    useStore.getState().setMessages([message])
    useStore.getState().archiveMessages([{ ...message, id: 'archive' }])
    const saved = JSON.parse(JSON.stringify(buildSessionFile()))
    expect(isValidSessionFile(saved)).toBe(true)
    useStore.setState(useStore.getInitialState(), true)
    restoreSession(saved)
    expect(useStore.getState().messages[0]?.costMetadata).toEqual(costMetadata)
    expect(useStore.getState().archivedMessages[0]?.costMetadata).toEqual(costMetadata)
  })

  it.each(['unknown', '', null, 0, {}])('rejects an invalid billing marker before clearing state: %j', (billing) => {
    useStore.getState().setCurrentSessionId('outgoing')
    const invalid = {
      ...buildSessionFile(), id: 'invalid',
      messages: [{
        id: 'message', role: 'assistant', content: 'Reply', personaLabel: 'Advisor',
        timestamp: 1000, windowId: 'advisor',
        costMetadata: { inputTokens: 12, outputTokens: 34, estimatedCost: 0, isEstimate: false, billing },
      }],
    }
    expect(isValidSessionFile(invalid)).toBe(false)
    restoreSession(JSON.parse(JSON.stringify(invalid)))
    expect(useStore.getState().currentSessionId).toBe('outgoing')
  })

  it('invalidates a captured generation when the same session is restored again', () => {
    const saved = { ...buildSessionFile(), id: 'same-session' }
    restoreSession(saved)
    const generation = getSessionGeneration()
    useStore.getState().setSessionInstructions('An ordinary edit')
    expect(getSessionGeneration()).toBe(generation)
    restoreSession(saved)
    expect(useStore.getState().currentSessionId).toBe('same-session')
    expect(getSessionGeneration()).toBeGreaterThan(generation)
  })

  it('advances the generation only when a new session is actually initialized', async () => {
    const generation = getSessionGeneration()
    await initializeNewSession()
    expect(getSessionGeneration()).toBeGreaterThan(generation)
    const initialized = getSessionGeneration()
    await initializeNewSession()
    expect(getSessionGeneration()).toBe(initialized)
  })

  it('does not invalidate the current generation for a rejected restore', () => {
    const generation = getSessionGeneration()
    restoreSession(JSON.parse(JSON.stringify({ ...buildSessionFile(), version: 99 })))
    expect(getSessionGeneration()).toBe(generation)
  })

  it('keeps one initialization when called again while its save is pending', async () => {
    let finishSave!: () => void
    const pendingSave = new Promise<void>((resolve) => { finishSave = resolve })
    const sessionSave = vi.fn(() => pendingSave)
    vi.stubGlobal('window', { consiliumAPI: { sessionSave } })
    const first = initializeNewSession()
    const sessionId = useStore.getState().currentSessionId
    const generation = getSessionGeneration()
    try {
      await initializeNewSession()
      expect(useStore.getState().currentSessionId).toBe(sessionId)
      expect(getSessionGeneration()).toBe(generation)
      expect(sessionSave).toHaveBeenCalledTimes(1)
    } finally {
      finishSave()
      await first
    }
  })

  it('advances the generation for a new conversation while the previous initial save is pending', async () => {
    let finishSave!: () => void
    const pendingSave = new Promise<void>((resolve) => { finishSave = resolve })
    const sessionSave = vi.fn(async () => {}).mockImplementationOnce(() => pendingSave)
    vi.stubGlobal('window', { consiliumAPI: { sessionSave } })
    const first = initializeNewSession()
    const firstId = useStore.getState().currentSessionId
    const generation = getSessionGeneration()
    // The New Consilium command clears the current conversation before initializing.
    const state = useStore.getState()
    state.clearMessages()
    state.clearAllWindows()
    state.setCurrentSessionId(null)
    try {
      await initializeNewSession()
      expect(getSessionGeneration()).toBeGreaterThan(generation)
      expect(useStore.getState().currentSessionId).not.toBeNull()
      expect(useStore.getState().currentSessionId).not.toBe(firstId)
      expect(sessionSave).toHaveBeenCalledTimes(2)
      const newId = useStore.getState().currentSessionId
      finishSave()
      await first
      expect(useStore.getState().currentSessionId).toBe(newId)
    } finally {
      finishSave()
      await first
    }
  })

  it('keeps the generation when saving assigns an ID to the same conversation', async () => {
    const generation = getSessionGeneration()
    await saveCurrentSession()
    expect(useStore.getState().currentSessionId).not.toBeNull()
    expect(getSessionGeneration()).toBe(generation)
  })
})
