import { describe, it, expect, vi, beforeEach } from 'vitest'
import { safeLog } from './safe-log'

const suffix20 = 'a'.repeat(20)

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('safeLog', () => {
  it('redacts API keys in string arguments', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const key = `sk-ant-${suffix20}`
    safeLog('error', `Failed with key ${key}`)
    expect(spy).toHaveBeenCalledWith('Failed with key [REDACTED]')
  })

  it('redacts API keys in Error message and stack', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const key = `sk-proj-${suffix20}`
    const error = new Error(`Auth failed: ${key}`)
    // Manually set stack to include key
    error.stack = `Error: Auth failed: ${key}\n    at test.ts:1:1`

    safeLog('error', error)

    const call = spy.mock.calls[0]!
    const logged = call[0] as { name: string; message: string; stack: string }
    expect(logged.message).toBe('Auth failed: [REDACTED]')
    expect(logged.stack).toContain('[REDACTED]')
    expect(logged.stack).not.toContain('sk-proj-')
  })

  it('passes non-string, non-Error arguments without keys through unchanged', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const obj = { count: 42 }
    safeLog('log', obj)
    expect(spy).toHaveBeenCalledWith(obj)
  })

  it('redacts API keys in plain objects', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const key = `sk-ant-${suffix20}`
    const obj = { config: { apiKey: key }, name: 'test' }
    safeLog('error', obj)
    const logged = spy.mock.calls[0]![0] as { config: { apiKey: string }; name: string }
    expect(logged.config.apiKey).toBe('[REDACTED]')
    expect(logged.name).toBe('test')
  })

  it('handles multiple arguments with mixed types', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const key = `xai-${suffix20}`
    safeLog('warn', 'prefix', `key=${key}`, 123)
    expect(spy).toHaveBeenCalledWith('prefix', 'key=[REDACTED]', 123)
  })

  it('routes to correct console method', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    safeLog('error', 'e')
    safeLog('warn', 'w')
    safeLog('log', 'l')

    expect(errorSpy).toHaveBeenCalledWith('e')
    expect(warnSpy).toHaveBeenCalledWith('w')
    expect(logSpy).toHaveBeenCalledWith('l')
  })
})
