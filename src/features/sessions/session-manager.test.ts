import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/store'
import type { AdvisorWindow, Message } from '@/types'
import type { SessionFile } from './session-types'
import { buildSessionFile, buildSessionPayload, initializeNewSession, loadSession, restoreSession } from './session-manager'

vi.mock('@/features/turnManager', () => ({ stopAll: vi.fn() }))
vi.mock('@/features/voting/vote-service', () => ({ cancelActiveVotes: vi.fn() }))

const advisor: AdvisorWindow = {
  id: 'advisor-1', provider: 'openai', model: 'example-model', keyId: 'key-ref',
  personaId: '', personaLabel: 'Advisor', accentColor: '#123456',
  runningCost: 1.25, isStreaming: false, streamContent: '', error: null,
  isCompacted: true, compactedSummary: 'Preserve this summary.', bufferSize: 10,
}
const message: Message = {
  id: 'message-1', role: 'user', content: 'Discuss the plan', personaLabel: 'You',
  timestamp: 1000, windowId: '',
}

function legacySession(id = 'saved-session'): SessionFile {
  return {
    version: 1, id, name: 'Saved council', createdAt: 1000, updatedAt: 2000,
    windows: [], messages: [message], archivedMessages: [], queue: [],
    turnMode: 'manual', sessionInstructions: 'Be precise.', totalCost: 0,
    inputFiles: [], outputFiles: [],
  }
}

const api = {
  sessionSave: vi.fn(async (_id: string, _content: string) => {}),
  sessionLoad: vi.fn(async (_id: string): Promise<string | null> => null),
}

beforeEach(() => {
  vi.resetAllMocks()
  useStore.setState(useStore.getInitialState(), true)
  vi.stubGlobal('window', { consiliumAPI: api })
})
afterEach(() => vi.unstubAllGlobals())

describe('session persistence', () => {
  it('round-trips budget, summaries, turn settings, messages, and compile spending', () => {
    const state = useStore.getState()
    state.setCurrentSessionId('current-session')
    state.addWindow(advisor)
    state.setMessages([message])
    state.archiveMessages([{ ...message, id: 'archived' }])
    state.setSessionBudget(12.5)
    state.setLoopCount(3)
    state.setSessionInstructions('Keep the discussion focused.')
    state.accumulateCompileCost(0.75)
    const saved = JSON.parse(JSON.stringify(buildSessionFile())) as SessionFile
    expect(saved.version).toBe(2)

    useStore.setState(useStore.getInitialState(), true)
    restoreSession(saved)
    expect(useStore.getState()).toMatchObject({
      currentSessionId: 'current-session', sessionBudget: 12.5, loopCount: 3,
      sessionInstructions: 'Keep the discussion focused.', sessionCompileCost: 0.75,
      messages: [message], archivedMessages: [{ ...message, id: 'archived' }],
      windows: { 'advisor-1': { compactedSummary: 'Preserve this summary.', runningCost: 1.25 } },
    })
    expect(buildSessionFile().totalCost).toBe(2)
  })

  it('loads v1 sessions with defaults instead of retaining the previous budget and loop count', async () => {
    useStore.getState().setSessionBudget(99)
    useStore.getState().setLoopCount(10)
    api.sessionLoad.mockResolvedValueOnce(JSON.stringify(legacySession()))
    await loadSession('saved-session')
    expect(useStore.getState()).toMatchObject({
      currentSessionId: 'saved-session', sessionBudget: 0, loopCount: 0,
    })
  })

  it('includes a named empty session in the close-time save', () => {
    useStore.getState().setCurrentSessionId('empty-session')
    useStore.getState().setSessionBudget(20)
    const payload = buildSessionPayload()
    expect(payload?.id).toBe('empty-session')
    expect(JSON.parse(payload!.content).sessionBudget).toBe(20)
  })

  it('does not create a session for an untouched empty store', () => {
    expect(buildSessionPayload()).toBeNull()
  })

  it('starts new sessions without carrying over a prior budget or loop count', async () => {
    useStore.getState().setSessionBudget(99)
    useStore.getState().setLoopCount(10)
    await initializeNewSession()
    expect(useStore.getState()).toMatchObject({ sessionBudget: 0, loopCount: 0 })
    expect(api.sessionSave).toHaveBeenCalledTimes(1)
  })

  it('saves a populated session without an ID before loading another session', async () => {
    useStore.getState().setMessages([message])
    api.sessionLoad.mockResolvedValueOnce(JSON.stringify(legacySession()))
    await loadSession('saved-session')
    expect(JSON.parse(api.sessionSave.mock.calls[0]![1]).messages).toEqual([message])
    expect(useStore.getState().currentSessionId).toBe('saved-session')
  })

  it('flushes edits to the outgoing session before restoring the next one', async () => {
    useStore.getState().setCurrentSessionId('outgoing')
    useStore.getState().setMessages([message])
    useStore.getState().setSessionInstructions('An unsaved edit')
    api.sessionLoad.mockResolvedValueOnce(JSON.stringify(legacySession()))
    await loadSession('saved-session')
    const saved = api.sessionSave.mock.calls.find(([id]) => id === 'outgoing')
    expect(saved).toBeDefined()
    expect(JSON.parse(saved![1]).sessionInstructions).toBe('An unsaved edit')
    expect(useStore.getState().currentSessionId).toBe('saved-session')
  })

  it('keeps the current session when its outgoing save fails', async () => {
    useStore.getState().setCurrentSessionId('outgoing')
    api.sessionLoad.mockResolvedValueOnce(JSON.stringify(legacySession()))
    api.sessionSave.mockRejectedValueOnce(new Error('Disk full'))
    await expect(loadSession('saved-session')).rejects.toThrow('Disk full')
    expect(useStore.getState().currentSessionId).toBe('outgoing')
  })

  it('ignores a slow load when a more recent session selection finishes first', async () => {
    let resolveSlow!: (value: string) => void
    api.sessionLoad.mockImplementationOnce(() => new Promise((resolve) => { resolveSlow = resolve }))
    api.sessionLoad.mockResolvedValueOnce(JSON.stringify(legacySession('newer')))
    const slow = loadSession('older')
    await vi.waitFor(() => expect(api.sessionLoad).toHaveBeenCalledWith('older'))
    await loadSession('newer')
    resolveSlow(JSON.stringify(legacySession('older')))
    await slow
    expect(useStore.getState().currentSessionId).toBe('newer')
  })

  it('saves an edit made while the outgoing save is pending', async () => {
    useStore.getState().setCurrentSessionId('outgoing')
    let finishSave!: () => void
    api.sessionSave.mockImplementationOnce(() => new Promise((resolve) => { finishSave = resolve }))
    api.sessionLoad.mockResolvedValueOnce(JSON.stringify(legacySession()))
    const loading = loadSession('saved-session')
    await vi.waitFor(() => expect(api.sessionSave).toHaveBeenCalledTimes(1))
    useStore.getState().setSessionInstructions('Edit during disk write')
    finishSave()
    await loading
    expect(JSON.parse(api.sessionSave.mock.calls[1]![1]).sessionInstructions).toBe('Edit during disk write')
    expect(useStore.getState().currentSessionId).toBe('saved-session')
  })

  it('does not apply a load after a new session was created', async () => {
    let resolveLoad!: (value: string) => void
    api.sessionLoad.mockImplementationOnce(() => new Promise((resolve) => { resolveLoad = resolve }))
    const loading = loadSession('saved-session')
    await initializeNewSession()
    const newId = useStore.getState().currentSessionId
    resolveLoad(JSON.stringify(legacySession()))
    await loading
    expect(useStore.getState().currentSessionId).toBe(newId)
  })

  it.each([
    { version: 99 }, { turnMode: 'invalid' }, { windows: [null] },
    { sessionBudget: -1 }, { sessionBudget: '20' }, { loopCount: 1.5 },
    { messages: [null] }, { queue: [null] }, { id: 'wrong-session' },
    { version: 2 }, { version: 2, sessionBudget: 1 },
  ])('rejects invalid session fields without clearing current state: %j', async (invalid) => {
    useStore.getState().setCurrentSessionId('outgoing')
    useStore.getState().setMessages([message])
    api.sessionLoad.mockResolvedValueOnce(JSON.stringify({ ...legacySession(), ...invalid }))
    await loadSession('saved-session')
    expect(useStore.getState().currentSessionId).toBe('outgoing')
    expect(useStore.getState().messages).toEqual([message])
  })
})
