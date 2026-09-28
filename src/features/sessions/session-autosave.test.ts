import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/store'
import { startSessionAutoSave } from './session-autosave'
import { buildSessionFile, restoreSession } from './session-manager'

const api = {
  sessionSave: vi.fn(async (_id: string, _content: string) => {}),
  sessionSaveSync: vi.fn((_id: string, _content: string) => true),
}
let autosave: ReturnType<typeof startSessionAutoSave>

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  useStore.setState(useStore.getInitialState(), true)
  vi.stubGlobal('window', { consiliumAPI: api })
  useStore.getState().setCurrentSessionId('session-a')
  useStore.getState().addWindow({
    id: 'advisor', provider: 'openai', model: 'initial-model', keyId: 'key-ref',
    personaId: '', personaLabel: 'Advisor', accentColor: '#123456', runningCost: 0,
    isStreaming: false, streamContent: '', error: null,
    isCompacted: false, compactedSummary: null, bufferSize: 10,
  })
  useStore.getState().setMessages([{
    id: 'message', role: 'user', content: 'Original', personaLabel: 'You', timestamp: 1000, windowId: '',
  }])
  autosave = startSessionAutoSave()
  vi.advanceTimersByTime(2000)
  vi.clearAllMocks()
})
afterEach(() => {
  autosave.dispose()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('session autosave', () => {
  it.each([
    ['instructions', () => useStore.getState().setSessionInstructions('New instructions')],
    ['model', () => useStore.getState().updateWindow('advisor', { model: 'new-model' })],
    ['budget', () => useStore.getState().setSessionBudget(15)],
    ['turn mode', () => useStore.getState().setTurnMode('parallel')],
    ['loop count', () => useStore.getState().setLoopCount(3)],
    ['compile cost', () => useStore.getState().accumulateCompileCost(0.5)],
    ['summary', () => useStore.getState().updateWindow('advisor', { compactedSummary: 'Summary' })],
    ['existing message edit', () => useStore.getState().setMessages([
      { ...useStore.getState().messages[0]!, content: 'Edited' },
    ])],
  ] as const)('saves %s changes without a count change', (_name, change) => {
    change()
    vi.advanceTimersByTime(1999)
    expect(api.sessionSave).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(api.sessionSave).toHaveBeenCalledTimes(1)
  })

  it('does not save or delay a pending save for stream chunks or UI changes', () => {
    useStore.getState().setSessionInstructions('Persist this')
    vi.advanceTimersByTime(1000)
    useStore.getState().updateWindow('advisor', { isStreaming: true, streamContent: 'Partial' })
    useStore.getState().setConfigModalOpen(true)
    vi.advanceTimersByTime(1000)
    expect(api.sessionSave).toHaveBeenCalledTimes(1)
    api.sessionSave.mockClear()
    useStore.getState().updateWindow('advisor', { streamContent: 'More partial content' })
    vi.advanceTimersByTime(2000)
    expect(api.sessionSave).not.toHaveBeenCalled()
  })

  it('saves clearing the last message and advisor in an existing session', () => {
    useStore.getState().clearMessages()
    useStore.getState().clearAllWindows()
    vi.advanceTimersByTime(2000)
    const saved = JSON.parse(api.sessionSave.mock.calls[0]![1])
    expect(saved.messages).toEqual([])
    expect(saved.windows).toEqual([])
  })

  it('cancels the outgoing debounce on restore and saves the first immediate edit', () => {
    const next = { ...buildSessionFile(), id: 'session-b' }
    useStore.getState().setSessionInstructions('Pending edit')
    restoreSession(next)
    vi.advanceTimersByTime(2000)
    expect(api.sessionSave).not.toHaveBeenCalled()
    useStore.getState().setSessionInstructions('New session edit')
    vi.advanceTimersByTime(2000)
    expect(api.sessionSave).toHaveBeenCalledTimes(1)
    expect(api.sessionSave.mock.calls[0]![0]).toBe('session-b')
  })

  it('synchronously saves the latest state on close and cancels the debounce', () => {
    useStore.getState().setSessionBudget(42)
    autosave.flush()
    expect(JSON.parse(api.sessionSaveSync.mock.calls[0]![1]).sessionBudget).toBe(42)
    vi.advanceTimersByTime(2000)
    expect(api.sessionSave).not.toHaveBeenCalled()
  })

  it('reschedules after setup-cleanup-setup as used by StrictMode', () => {
    useStore.getState().setSessionInstructions('Edited before cleanup')
    autosave.dispose()
    autosave = startSessionAutoSave()
    vi.advanceTimersByTime(2000)
    expect(api.sessionSave).toHaveBeenCalledTimes(1)
  })

  it('does not recreate a removed session when its ID is cleared', () => {
    useStore.getState().setSessionInstructions('Pending edit')
    useStore.getState().setCurrentSessionId(null)
    useStore.getState().setSessionDocuments([])
    vi.advanceTimersByTime(2000)
    autosave.flush()
    expect(api.sessionSave).not.toHaveBeenCalled()
    expect(api.sessionSaveSync).not.toHaveBeenCalled()
  })
})
