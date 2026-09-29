import { describe, it, expect } from 'vitest'
import { readinessFromAuthStatus, accountEmailFromAuthStatus, turnReadinessFromAuthStatus } from './auth-status'

const VERSION = '2.1.284'

describe('readinessFromAuthStatus', () => {
  it('is ready for a claude.ai subscription login and keeps only the plan', () => {
    const stdout = JSON.stringify({
      loggedIn: true,
      authMethod: 'claude.ai',
      apiProvider: 'firstParty',
      email: 'someone@example.com',
      orgId: 'org-123',
      orgName: "someone's Organization",
      subscriptionType: 'max',
    })
    const readiness = readinessFromAuthStatus(stdout, VERSION)
    expect(readiness).toEqual({ state: 'ready', runtimeVersion: VERSION, plan: 'max' })
    expect(JSON.stringify(readiness)).not.toContain('example.com')
    expect(JSON.stringify(readiness)).not.toContain('org-123')
  })

  it('is signed-out when not logged in', () => {
    expect(readinessFromAuthStatus(JSON.stringify({ loggedIn: false, authMethod: 'none' }), VERSION))
      .toEqual({ state: 'signed-out' })
  })

  it('is wrong-auth for API-key authentication, never ready', () => {
    const readiness = readinessFromAuthStatus(JSON.stringify({ loggedIn: true, authMethod: 'apiKey' }), VERSION)
    expect(readiness.state).toBe('wrong-auth')
  })

  it('is wrong-auth for third-party providers', () => {
    const readiness = readinessFromAuthStatus(
      JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'bedrock' }),
      VERSION,
    )
    expect(readiness.state).toBe('wrong-auth')
  })

  it('fails closed on unrecognised or malformed output', () => {
    expect(readinessFromAuthStatus('not json', VERSION).state).toBe('error')
    expect(readinessFromAuthStatus('[]', VERSION).state).toBe('error')
    expect(readinessFromAuthStatus(JSON.stringify({ loggedIn: 'yes' }), VERSION).state).toBe('error')
    expect(readinessFromAuthStatus(JSON.stringify({ loggedIn: true }), VERSION).state).toBe('wrong-auth')
  })

  it('drops a plan value that is not a short identifier', () => {
    const stdout = JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: '<script>' })
    expect(readinessFromAuthStatus(stdout, VERSION)).toEqual({ state: 'ready', runtimeVersion: VERSION })
  })
})

describe('accountEmailFromAuthStatus', () => {
  it('returns the email for redaction', () => {
    expect(accountEmailFromAuthStatus(JSON.stringify({ loggedIn: true, email: 'someone@example.com' }))).toBe('someone@example.com')
  })

  it.each([
    ['missing', JSON.stringify({ loggedIn: true })],
    ['not an email', JSON.stringify({ email: 'nobody' })],
    ['not a string', JSON.stringify({ email: 42 })],
    ['malformed JSON', 'nope'],
  ])('returns undefined when the email is %s', (_label, stdout) => {
    expect(accountEmailFromAuthStatus(stdout)).toBeUndefined()
  })
})

describe('turnReadinessFromAuthStatus', () => {
  const ready = { loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', subscriptionType: 'max' }

  it('is ready with the email kept separately from readiness', () => {
    const result = turnReadinessFromAuthStatus(JSON.stringify({ ...ready, email: 'someone@example.com' }), VERSION)
    expect(result).toEqual({ readiness: { state: 'ready', runtimeVersion: VERSION, plan: 'max' }, accountEmail: 'someone@example.com' })
    expect(JSON.stringify(result.readiness)).not.toContain('example.com')
  })

  it.each([
    ['missing', undefined],
    ['invalid', 'not-an-email'],
    ['too short to redact', 'a@b.c'],
  ])('fails closed when the email is %s', (_label, email) => {
    const result = turnReadinessFromAuthStatus(JSON.stringify({ ...ready, email }), VERSION)
    expect(result.readiness.state).toBe('error')
    expect(result.accountEmail).toBeUndefined()
  })

  it('passes a not-ready state through without reading the email', () => {
    const result = turnReadinessFromAuthStatus(JSON.stringify({ loggedIn: false, email: 'someone@example.com' }), VERSION)
    expect(result).toEqual({ readiness: { state: 'signed-out' } })
  })
})
