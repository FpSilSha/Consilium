import { describe, it, expect, vi } from 'vitest'
import { createRequestRegistry } from './request-registry'

const owner = { webContentsId: 7, sessionId: 's1', generation: 2 }

describe('request registry', () => {
  it('registers a request once and rejects duplicate IDs', () => {
    const registry = createRequestRegistry()
    expect(registry.register('r1', owner, vi.fn())).toBe(true)
    expect(registry.register('r1', owner, vi.fn())).toBe(false)
  })

  it('stores an immutable owner record', () => {
    const registry = createRequestRegistry()
    const mutable = { ...owner }
    registry.register('r1', mutable, vi.fn())
    mutable.webContentsId = 99
    expect(registry.ownerOf('r1')).toEqual(owner)
    expect(Object.isFrozen(registry.ownerOf('r1'))).toBe(true)
  })

  it('cancels only when the request belongs to the calling webContents', () => {
    const registry = createRequestRegistry()
    const cancel = vi.fn()
    registry.register('r1', owner, cancel)
    expect(registry.cancel('r1', 8)).toBe(false)
    expect(cancel).not.toHaveBeenCalled()
    expect(registry.cancel('r1', 7)).toBe(true)
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('returns false for unknown or finished requests', () => {
    const registry = createRequestRegistry()
    const cancel = vi.fn()
    registry.register('r1', owner, cancel)
    registry.finish('r1')
    expect(registry.cancel('r1', 7)).toBe(false)
    expect(registry.cancel('nope', 7)).toBe(false)
    expect(cancel).not.toHaveBeenCalled()
  })

  it('cancels everything owned by a closed webContents and nothing else', () => {
    const registry = createRequestRegistry()
    const mine = vi.fn()
    const theirs = vi.fn()
    registry.register('r1', owner, mine)
    registry.register('r2', { ...owner, webContentsId: 8 }, theirs)
    registry.cancelAllFor(7)
    expect(mine).toHaveBeenCalledTimes(1)
    expect(theirs).not.toHaveBeenCalled()
  })

  it('cancels everything on shutdown', () => {
    const registry = createRequestRegistry()
    const a = vi.fn()
    const b = vi.fn()
    registry.register('r1', owner, a)
    registry.register('r2', { ...owner, webContentsId: 8 }, b)
    registry.cancelAll()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })
})
