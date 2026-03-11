import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createUserMessage,
  createAssistantMessage,
  createSystemMessage,
} from './message-factory'
import type { CostMetadata } from '@/types'

const FIXED_TIMESTAMP = 1_700_000_000_000

const sampleCostMetadata: CostMetadata = {
  inputTokens: 120,
  outputTokens: 340,
  estimatedCost: 0.0042,
  isEstimate: false,
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_TIMESTAMP)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createUserMessage', () => {
  it('sets role to "user"', () => {
    const msg = createUserMessage('hello', 'win-1')
    expect(msg.role).toBe('user')
  })

  it('sets personaLabel to "You" unconditionally', () => {
    const msg = createUserMessage('anything', 'win-1')
    expect(msg.personaLabel).toBe('You')
  })

  it('passes content through unchanged', () => {
    const msg = createUserMessage('my question', 'win-1')
    expect(msg.content).toBe('my question')
  })

  it('sets windowId to the provided value', () => {
    const msg = createUserMessage('hello', 'win-abc-42')
    expect(msg.windowId).toBe('win-abc-42')
  })

  it('leaves costMetadata undefined', () => {
    const msg = createUserMessage('hello', 'win-1')
    expect(msg.costMetadata).toBeUndefined()
  })

  it('sets timestamp close to Date.now()', () => {
    const before = Date.now()
    const msg = createUserMessage('hello', 'win-1')
    const after = Date.now()
    expect(msg.timestamp).toBeGreaterThanOrEqual(before)
    expect(msg.timestamp).toBeLessThanOrEqual(after)
  })

  it('generates an id starting with "msg_"', () => {
    const msg = createUserMessage('hello', 'win-1')
    expect(msg.id).toMatch(/^msg_/)
  })

  it('generates unique ids on successive calls', () => {
    // Advance time between calls so Date.now() differs
    const msg1 = createUserMessage('first', 'win-1')
    vi.advanceTimersByTime(1)
    const msg2 = createUserMessage('second', 'win-1')
    expect(msg1.id).not.toBe(msg2.id)
  })
})

describe('createAssistantMessage', () => {
  it('sets role to "assistant"', () => {
    const msg = createAssistantMessage('reply', 'GPT-4', 'win-1')
    expect(msg.role).toBe('assistant')
  })

  it('uses the supplied personaLabel', () => {
    const msg = createAssistantMessage('reply', 'Analyst', 'win-1')
    expect(msg.personaLabel).toBe('Analyst')
  })

  it('passes content through unchanged', () => {
    const msg = createAssistantMessage('detailed answer', 'GPT-4', 'win-1')
    expect(msg.content).toBe('detailed answer')
  })

  it('sets windowId correctly', () => {
    const msg = createAssistantMessage('reply', 'GPT-4', 'win-xyz')
    expect(msg.windowId).toBe('win-xyz')
  })

  it('attaches costMetadata when provided', () => {
    const msg = createAssistantMessage('reply', 'GPT-4', 'win-1', sampleCostMetadata)
    expect(msg.costMetadata).toEqual(sampleCostMetadata)
  })

  it('leaves costMetadata undefined when omitted', () => {
    const msg = createAssistantMessage('reply', 'GPT-4', 'win-1')
    expect(msg.costMetadata).toBeUndefined()
  })

  it('generates an id starting with "msg_"', () => {
    const msg = createAssistantMessage('reply', 'GPT-4', 'win-1')
    expect(msg.id).toMatch(/^msg_/)
  })

  it('preserves all CostMetadata fields exactly', () => {
    const msg = createAssistantMessage('reply', 'GPT-4', 'win-1', sampleCostMetadata)
    expect(msg.costMetadata?.inputTokens).toBe(120)
    expect(msg.costMetadata?.outputTokens).toBe(340)
    expect(msg.costMetadata?.estimatedCost).toBe(0.0042)
    expect(msg.costMetadata?.isEstimate).toBe(false)
  })

  it('generates unique ids on successive calls', () => {
    const msg1 = createAssistantMessage('first', 'GPT-4', 'win-1')
    vi.advanceTimersByTime(1)
    const msg2 = createAssistantMessage('second', 'GPT-4', 'win-1')
    expect(msg1.id).not.toBe(msg2.id)
  })
})

describe('createSystemMessage', () => {
  it('sets role to "system"', () => {
    const msg = createSystemMessage('sys instructions', 'win-1')
    expect(msg.role).toBe('system')
  })

  it('sets personaLabel to "System" unconditionally', () => {
    const msg = createSystemMessage('anything', 'win-1')
    expect(msg.personaLabel).toBe('System')
  })

  it('passes content through unchanged', () => {
    const msg = createSystemMessage('You are a helpful assistant.', 'win-1')
    expect(msg.content).toBe('You are a helpful assistant.')
  })

  it('sets windowId correctly', () => {
    const msg = createSystemMessage('instructions', 'win-sys-99')
    expect(msg.windowId).toBe('win-sys-99')
  })

  it('leaves costMetadata undefined', () => {
    const msg = createSystemMessage('instructions', 'win-1')
    expect(msg.costMetadata).toBeUndefined()
  })

  it('generates an id starting with "msg_"', () => {
    const msg = createSystemMessage('instructions', 'win-1')
    expect(msg.id).toMatch(/^msg_/)
  })

  it('sets timestamp equal to fixed Date.now()', () => {
    const msg = createSystemMessage('instructions', 'win-1')
    expect(msg.timestamp).toBe(FIXED_TIMESTAMP)
  })

  it('generates unique ids on successive calls', () => {
    const msg1 = createSystemMessage('first', 'win-1')
    vi.advanceTimersByTime(1)
    const msg2 = createSystemMessage('second', 'win-1')
    expect(msg1.id).not.toBe(msg2.id)
  })
})

describe('id uniqueness across factories', () => {
  it('user and assistant messages created at the same tick have different ids', () => {
    const user = createUserMessage('hello', 'win-1')
    // Same tick — randomUUID differentiates them
    const assistant = createAssistantMessage('reply', 'GPT-4', 'win-1')
    expect(user.id).not.toBe(assistant.id)
  })

  it('all three factories produce ids in "msg_<timestamp>_<uuid>" shape', () => {
    const idPattern = /^msg_\d+_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    expect(createUserMessage('a', 'w').id).toMatch(idPattern)
    expect(createAssistantMessage('b', 'Bot', 'w').id).toMatch(idPattern)
    expect(createSystemMessage('c', 'w').id).toMatch(idPattern)
  })
})
