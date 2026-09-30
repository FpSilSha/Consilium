import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/store'
import type { SessionDocument } from '@/features/documents/types'
import { buildSessionFile, buildSessionPayload, restoreSession } from './session-manager'

const doc = (id: string): SessionDocument => ({
  id, title: id, content: 'Compiled content', provider: 'openai', model: 'example-model',
  modelName: 'Example', cost: 0.1, createdAt: 1000,
})
const documentsLoad = vi.fn(async (_id: string): Promise<SessionDocument | null> => null)

beforeEach(() => {
  vi.resetAllMocks()
  useStore.setState(useStore.getInitialState(), true)
  vi.stubGlobal('window', { consiliumAPI: { documentsLoad } })
})
afterEach(() => vi.unstubAllGlobals())

describe('session document restoration', () => {
  it('saves the new references and clears old documents before asynchronous loads finish', async () => {
    useStore.getState().addDocument(doc('old-doc'))
    let finish!: (value: SessionDocument) => void
    documentsLoad.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    restoreSession({ ...buildSessionFile(), id: 'session-b', documentIds: ['new-doc'] })
    expect(useStore.getState().documents).toEqual([])
    expect(JSON.parse(buildSessionPayload()!.content).documentIds).toEqual(['new-doc'])
    finish(doc('new-doc'))
    await vi.waitFor(() => expect(useStore.getState().documents).toEqual([doc('new-doc')]))
  })

  it('preserves additions and removals while document loads are pending', async () => {
    let finish!: (value: SessionDocument) => void
    documentsLoad.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    documentsLoad.mockResolvedValueOnce(doc('keep'))
    restoreSession({ ...buildSessionFile(), id: 'session-a', documentIds: ['remove', 'keep'] })
    useStore.getState().addDocument(doc('added'))
    expect(useStore.getState().documentIds).toEqual(['added', 'remove', 'keep'])
    useStore.getState().removeDocumentFromSession('remove')
    finish(doc('remove'))
    await vi.waitFor(() => expect(useStore.getState().documents).toEqual([doc('added'), doc('keep')]))
    expect(useStore.getState().documentIds).toEqual(['added', 'keep'])
  })

  it('discards stale document results even when the same session is reopened', async () => {
    let finish!: (value: SessionDocument) => void
    documentsLoad.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    documentsLoad.mockResolvedValueOnce({ ...doc('same-doc'), content: 'Newer content' })
    const saved = { ...buildSessionFile(), id: 'session-a', documentIds: ['same-doc'] }
    restoreSession(saved)
    restoreSession({ ...saved, id: 'session-b', documentIds: [] })
    restoreSession(saved)
    await vi.waitFor(() => expect(useStore.getState().documents[0]?.content).toBe('Newer content'))
    finish(doc('same-doc'))
    await Promise.resolve()
    expect(useStore.getState().documents[0]?.content).toBe('Newer content')
  })

  it('drops missing documents after loading completes', async () => {
    restoreSession({ ...buildSessionFile(), id: 'session-a', documentIds: ['missing'] })
    await vi.waitFor(() => expect(useStore.getState().documentIds).toEqual([]))
  })
})
