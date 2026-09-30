import { describe, it, expect } from 'vitest'
import { emptyStateGuidance, emptyAdvisorListText } from './empty-state-guidance'

describe('emptyStateGuidance', () => {
  it('asks for an API key or a subscription when there is neither', () => {
    const g = emptyStateGuidance({ hasKeys: false, subscription: 'unavailable', advisorCount: 0 })
    expect(g).toMatchObject({ message: 'Add an API key for a service, or add your Claude subscription.', showModelsAndKeys: true })
    expect(g?.detail).toMatch(/install Claude Code, sign in/)
    expect(g?.hint).toBeUndefined()
  })

  it('shows nothing while the subscription check runs and there are no keys', () => {
    expect(emptyStateGuidance({ hasKeys: false, subscription: 'checking', advisorCount: 1 })).toBeNull()
  })

  it('with only a subscription, moves on and suggests adding an API key', () => {
    const noAdvisors = emptyStateGuidance({ hasKeys: false, subscription: 'available', advisorCount: 0 })
    // New advisors default to an API-key provider, so the message says to switch it.
    expect(noAdvisors).toMatchObject({ message: 'Add your first advisor in the panel on the right, then choose "Claude subscription (Claude Code)" as its provider.', showModelsAndKeys: false })
    expect(noAdvisors?.hint).toBe('You can also add an API key for another service in Models & Keys.')
    const ready = emptyStateGuidance({ hasKeys: false, subscription: 'available', advisorCount: 2 })
    expect(ready?.message).toBe('Type a message below to start the conversation.')
    expect(ready?.hint).toBe('You can also add an API key for another service in Models & Keys.')
  })

  it('with API keys, asks for a first advisor without mentioning the subscription provider', () => {
    expect(emptyStateGuidance({ hasKeys: true, subscription: 'available', advisorCount: 0 })?.message).toBe('Add your first advisor in the panel on the right.')
    expect(emptyStateGuidance({ hasKeys: true, subscription: 'unavailable', advisorCount: 0 })?.message).toBe('Add your first advisor in the panel on the right.')
  })

  it('with only API keys, suggests the personal subscription', () => {
    const g = emptyStateGuidance({ hasKeys: true, subscription: 'unavailable', advisorCount: 1 })
    expect(g?.message).toBe('Type a message below to start the conversation.')
    expect(g?.hint).toMatch(/^You can use your personal Claude subscription for yourself!/)
  })

  it('gives no hint when both are set up, or while the check is still running', () => {
    expect(emptyStateGuidance({ hasKeys: true, subscription: 'available', advisorCount: 1 })?.hint).toBeUndefined()
    expect(emptyStateGuidance({ hasKeys: true, subscription: 'checking', advisorCount: 1 })?.hint).toBeUndefined()
  })
})

describe('emptyAdvisorListText', () => {
  it('asks for a key or subscription only when neither is available', () => {
    expect(emptyAdvisorListText(false, 'unavailable')).toBe('Add an API key or your Claude subscription first.')
    expect(emptyAdvisorListText(false, 'checking')).toBeNull()
    expect(emptyAdvisorListText(true, 'checking')).toBe('No advisors yet. Click "+ Add Advisor" above.')
    expect(emptyAdvisorListText(false, 'available')).toBe('No advisors yet. Click "+ Add Advisor" above, then choose "Claude subscription (Claude Code)" as its provider.')
    expect(emptyAdvisorListText(true, 'unavailable')).toBe('No advisors yet. Click "+ Add Advisor" above.')
  })
})
