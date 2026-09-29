import { describe, it, expect } from 'vitest'
import { parseVersion, isSupportedVersion } from './node-deps'

describe('Claude Code version checks', () => {
  it('parses the --version output', () => {
    expect(parseVersion('2.1.284 (Claude Code)\n')).toEqual([2, 1, 284])
    expect(parseVersion('Claude Code')).toBeNull()
  })

  it('requires at least the verified version', () => {
    expect(isSupportedVersion([2, 1, 284])).toBe(true)
    expect(isSupportedVersion([2, 1, 300])).toBe(true)
    expect(isSupportedVersion([2, 2, 0])).toBe(true)
    expect(isSupportedVersion([3, 0, 0])).toBe(true)
    expect(isSupportedVersion([2, 1, 51])).toBe(false)
    expect(isSupportedVersion([1, 9, 999])).toBe(false)
  })
})
