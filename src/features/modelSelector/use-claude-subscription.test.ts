import { describe, it, expect, vi, afterEach } from 'vitest'
import { beginClaudeSubscriptionCheck, loadClaudeSubscriptionAvailability, recordClaudeSubscriptionReadiness, refreshClaudeSubscriptionAvailability, resetClaudeSubscriptionAvailabilityCache } from './use-claude-subscription'

function stubReadiness(result: unknown | Error) {
  const localAgentReadiness = vi.fn(async () => {
    if (result instanceof Error) throw result
    return result
  })
  vi.stubGlobal('consiliumAPI', {
    localAgentReadiness,
    localAgentStart: vi.fn(),
    localAgentCancel: vi.fn(),
    onLocalAgentEvent: vi.fn(),
  })
  return localAgentReadiness
}

afterEach(() => {
  vi.unstubAllGlobals()
  resetClaudeSubscriptionAvailabilityCache()
})

describe('loadClaudeSubscriptionAvailability', () => {
  it('is available only when Claude Code reports ready', async () => {
    stubReadiness({ state: 'ready', runtimeVersion: '2.1.284' })
    expect(await loadClaudeSubscriptionAvailability()).toBe('available')
    resetClaudeSubscriptionAvailabilityCache()
    stubReadiness({ state: 'signed-out' })
    expect(await loadClaudeSubscriptionAvailability()).toBe('unavailable')
  })

  it('treats a failed check or a missing desktop bridge as unavailable', async () => {
    stubReadiness(new Error('ipc gone'))
    expect(await loadClaudeSubscriptionAvailability()).toBe('unavailable')
    resetClaudeSubscriptionAvailabilityCache()
    vi.unstubAllGlobals()
    expect(await loadClaudeSubscriptionAvailability()).toBe('unavailable')
  })

  it('reuses one check for concurrent callers and for a minute afterwards', async () => {
    const readiness = stubReadiness({ state: 'ready', runtimeVersion: '2.1.284' })
    await Promise.all([loadClaudeSubscriptionAvailability(), loadClaudeSubscriptionAvailability()])
    await loadClaudeSubscriptionAvailability(Date.now() + 30_000)
    expect(readiness).toHaveBeenCalledTimes(1)
    await loadClaudeSubscriptionAvailability(Date.now() + 61_000)
    expect(readiness).toHaveBeenCalledTimes(2)
  })
})

describe('recordClaudeSubscriptionReadiness', () => {
  it('shares a check made elsewhere, so the next load needs no new check', async () => {
    const readiness = stubReadiness({ state: 'signed-out' })
    recordClaudeSubscriptionReadiness({ state: 'ready', runtimeVersion: '2.1.284' })
    expect(await loadClaudeSubscriptionAvailability()).toBe('available')
    expect(readiness).not.toHaveBeenCalled()
  })

  it('replaces an older cached result', async () => {
    stubReadiness({ state: 'ready', runtimeVersion: '2.1.284' })
    expect(await loadClaudeSubscriptionAvailability()).toBe('available')
    recordClaudeSubscriptionReadiness({ state: 'signed-out' })
    expect(await loadClaudeSubscriptionAvailability()).toBe('unavailable')
  })
})

describe('ordering and focus re-checks', () => {
  it('does not let an older check overwrite a newer recorded result', async () => {
    let finish: (value: unknown) => void = () => {}
    vi.stubGlobal('consiliumAPI', {
      localAgentReadiness: vi.fn(() => new Promise((resolve) => { finish = resolve })),
      localAgentStart: vi.fn(), localAgentCancel: vi.fn(), onLocalAgentEvent: vi.fn(),
    })
    const pending = loadClaudeSubscriptionAvailability()
    recordClaudeSubscriptionReadiness({ state: 'ready', runtimeVersion: '2.1.284' })
    finish({ state: 'signed-out' })
    expect(await pending).toBe('available')
    expect(await loadClaudeSubscriptionAvailability()).toBe('available')
  })

  it('re-checks an "unavailable" result on focus after a few seconds, within the cache window', async () => {
    const readiness = stubReadiness({ state: 'signed-out' })
    expect(await loadClaudeSubscriptionAvailability()).toBe('unavailable')
    await refreshClaudeSubscriptionAvailability(Date.now() + 1_000)
    expect(readiness).toHaveBeenCalledTimes(1)
    await refreshClaudeSubscriptionAvailability(Date.now() + 6_000)
    expect(readiness).toHaveBeenCalledTimes(2)
  })

  it('keeps using a cached "available" result on focus', async () => {
    const readiness = stubReadiness({ state: 'ready', runtimeVersion: '2.1.284' })
    await loadClaudeSubscriptionAvailability()
    await refreshClaudeSubscriptionAvailability(Date.now() + 30_000)
    expect(readiness).toHaveBeenCalledTimes(1)
  })
})

describe('results apply in the order checks started', () => {
  it('ignores an editor check that started before a newer check reported', async () => {
    stubReadiness({ state: 'ready', runtimeVersion: '2.1.284' })
    const editorTicket = beginClaudeSubscriptionCheck() // editor starts while signed out
    expect(await loadClaudeSubscriptionAvailability()).toBe('available') // a later check reports
    recordClaudeSubscriptionReadiness({ state: 'signed-out' }, editorTicket) // the older editor check lands
    expect(await loadClaudeSubscriptionAvailability()).toBe('available')
  })
})
