import { describe, it, expect, vi, afterEach } from 'vitest'
import { useStore } from '@/store'
import type { AdvisorWindow } from '@/types'
import { callForVote, cancelActiveVotes } from './vote-service'

const subscriptionAdvisor: AdvisorWindow = {
  id: 'w1',
  provider: 'claude-subscription',
  keyId: '',
  model: 'claude-opus-5-5',
  personaId: '',
  personaLabel: 'No Persona',
  accentColor: '#4A90D9',
  runningCost: 0,
  isStreaming: false,
  streamContent: '',
  error: null,
  isCompacted: false,
  compactedSummary: null,
  bufferSize: 15,
}

afterEach(() => {
  vi.unstubAllGlobals()
  cancelActiveVotes()
})

describe('votes with a Claude subscription advisor', () => {
  it('settles when the vote is cancelled while the local runtime is still silent', async () => {
    const localAgentStart = vi.fn(async () => ({ ok: true as const }))
    vi.stubGlobal('consiliumAPI', {
      localAgentStart,
      localAgentCancel: vi.fn(async () => true),
      localAgentReadiness: vi.fn(),
      onLocalAgentEvent: () => () => {},
    })
    useStore.setState({ windows: { w1: subscriptionAdvisor }, windowOrder: ['w1'] })

    let settled = false
    const vote = callForVote('Ship on Friday?').finally(() => { settled = true })
    await vi.waitFor(() => expect(localAgentStart).toHaveBeenCalled())

    cancelActiveVotes()
    await vi.waitFor(() => expect(settled).toBe(true))
    await expect(vote).resolves.toBeDefined()
  })
})
