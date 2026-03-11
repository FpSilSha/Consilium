import { describe, it, expect } from 'vitest'
import { messagesToApiFormat } from './message-formatter'
import type { Message } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _idCounter = 0
function makeMessage(
  role: Message['role'],
  content: string,
  personaLabel = 'Advisor',
): Message {
  return {
    id: `msg-${++_idCounter}`,
    role,
    content,
    personaLabel,
    timestamp: Date.now(),
    windowId: 'win-test',
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('messagesToApiFormat', () => {
  describe('empty input', () => {
    it('returns an empty array when given an empty array', () => {
      expect(messagesToApiFormat([])).toEqual([])
    })
  })

  describe('user messages', () => {
    it('maps a user message to role "user"', () => {
      const msgs = [makeMessage('user', 'What is the capital of France?')]
      const result = messagesToApiFormat(msgs)
      expect(result).toHaveLength(1)
      expect(result[0]?.role).toBe('user')
    })

    it('prefixes user message content with [You]: regardless of personaLabel', () => {
      const msgs = [makeMessage('user', 'Hello there', 'SomePersona')]
      const result = messagesToApiFormat(msgs)
      expect(result[0]?.content).toBe('[You]: Hello there')
    })
  })

  describe('assistant messages', () => {
    it('maps an assistant message to role "assistant"', () => {
      const msgs = [makeMessage('assistant', 'I can help with that.', 'Security Engineer')]
      const result = messagesToApiFormat(msgs)
      expect(result).toHaveLength(1)
      expect(result[0]?.role).toBe('assistant')
    })

    it('prefixes assistant message content with [PersonaLabel]:', () => {
      const msgs = [makeMessage('assistant', 'Use AES-256.', 'Security Engineer')]
      const result = messagesToApiFormat(msgs)
      expect(result[0]?.content).toBe('[Security Engineer]: Use AES-256.')
    })

  })

  describe('system messages', () => {
    it('filters out a single system message entirely', () => {
      const msgs = [makeMessage('system', 'You are a helpful assistant.')]
      const result = messagesToApiFormat(msgs)
      expect(result).toHaveLength(0)
    })

    it('filters out system messages when mixed with other roles', () => {
      const msgs = [
        makeMessage('user', 'Hello'),
        makeMessage('system', 'Internal directive'),
        makeMessage('assistant', 'Hi there', 'Advisor'),
      ]
      const result = messagesToApiFormat(msgs)
      expect(result).toHaveLength(2)
      for (const m of result) {
        expect(m.role).not.toBe('system')
      }
    })

    it('filters out multiple system messages', () => {
      const msgs = [
        makeMessage('system', 'Directive one'),
        makeMessage('system', 'Directive two'),
        makeMessage('user', 'A real question'),
      ]
      const result = messagesToApiFormat(msgs)
      expect(result).toHaveLength(1)
      expect(result[0]?.role).toBe('user')
    })

    it('returns an empty array when input contains only system messages', () => {
      const msgs = [
        makeMessage('system', 'System message A'),
        makeMessage('system', 'System message B'),
      ]
      expect(messagesToApiFormat(msgs)).toEqual([])
    })
  })

  describe('mixed message arrays', () => {
    it('preserves the original order of user and assistant messages', () => {
      const msgs = [
        makeMessage('user', 'First question', 'You'),
        makeMessage('assistant', 'First answer', 'Advisor'),
        makeMessage('user', 'Follow-up', 'You'),
        makeMessage('assistant', 'Follow-up answer', 'Advisor'),
      ]
      const result = messagesToApiFormat(msgs)
      expect(result).toHaveLength(4)
      expect(result[0]?.role).toBe('user')
      expect(result[1]?.role).toBe('assistant')
      expect(result[2]?.role).toBe('user')
      expect(result[3]?.role).toBe('assistant')
    })

    it('correctly strips system messages while preserving user/assistant order', () => {
      const msgs = [
        makeMessage('system', 'Preamble'),
        makeMessage('user', 'Message A'),
        makeMessage('system', 'Interleaved directive'),
        makeMessage('assistant', 'Reply B', 'Persona'),
        makeMessage('system', 'Postscript'),
      ]
      const result = messagesToApiFormat(msgs)
      expect(result).toHaveLength(2)
      expect(result[0]?.content).toBe('[You]: Message A')
      expect(result[1]?.content).toBe('[Persona]: Reply B')
    })

    it('output array length equals non-system message count', () => {
      const msgs = [
        makeMessage('user', 'u1'),
        makeMessage('assistant', 'a1', 'P1'),
        makeMessage('system', 's1'),
        makeMessage('user', 'u2'),
        makeMessage('system', 's2'),
        makeMessage('assistant', 'a2', 'P2'),
      ]
      const result = messagesToApiFormat(msgs)
      // 2 user + 2 assistant = 4
      expect(result).toHaveLength(4)
    })
  })

  describe('identity header format', () => {
    it('user header format is exactly "[You]: <content>"', () => {
      const result = messagesToApiFormat([makeMessage('user', 'ping')])
      expect(result[0]?.content).toBe('[You]: ping')
    })

    it('assistant header format is exactly "[<personaLabel>]: <content>"', () => {
      const result = messagesToApiFormat([makeMessage('assistant', 'pong', 'Oracle')])
      expect(result[0]?.content).toBe('[Oracle]: pong')
    })

    it('handles persona labels containing spaces', () => {
      const result = messagesToApiFormat([makeMessage('assistant', 'analysis complete', 'Senior Architect')])
      expect(result[0]?.content).toBe('[Senior Architect]: analysis complete')
    })

    it('handles content that already contains bracket notation without double-wrapping', () => {
      const result = messagesToApiFormat([makeMessage('user', '[Some]: existing bracket content')])
      expect(result[0]?.content).toBe('[You]: [Some]: existing bracket content')
    })

    it('handles multi-line content correctly', () => {
      const multiLine = 'Line one\nLine two\nLine three'
      const result = messagesToApiFormat([makeMessage('assistant', multiLine, 'Writer')])
      expect(result[0]?.content).toBe(`[Writer]: ${multiLine}`)
    })
  })
})
