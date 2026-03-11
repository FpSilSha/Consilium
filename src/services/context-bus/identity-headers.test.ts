import { describe, it, expect } from 'vitest'
import {
  formatWithIdentityHeader,
  formatThreadForAgent,
  stripMentions,
  extractMentions,
} from './identity-headers'
import type { Message } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _msgCounter = 0
function makeMessage(overrides: Partial<Message> & Pick<Message, 'role' | 'content'>): Message {
  _msgCounter += 1
  return {
    id: `msg-${_msgCounter}`,
    personaLabel: 'Advisor',
    timestamp: _msgCounter * 1000,
    windowId: `win-${_msgCounter}`,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// formatWithIdentityHeader
// ---------------------------------------------------------------------------

describe('formatWithIdentityHeader', () => {
  describe('user role', () => {
    it('uses "You" as the label for user messages regardless of personaLabel', () => {
      const msg = makeMessage({
        role: 'user',
        content: 'Hello there.',
        personaLabel: 'SomeUser',
      })
      expect(formatWithIdentityHeader(msg)).toBe('[You]: Hello there.')
    })

    it('does not include the personaLabel in the formatted output for user role', () => {
      const msg = makeMessage({ role: 'user', content: 'Test', personaLabel: 'HumanOperator' })
      expect(formatWithIdentityHeader(msg)).not.toContain('HumanOperator')
    })
  })

  describe('assistant role', () => {
    it('uses personaLabel as the label for assistant messages', () => {
      const msg = makeMessage({
        role: 'assistant',
        content: 'AES-256 is recommended.',
        personaLabel: 'Security Engineer',
      })
      expect(formatWithIdentityHeader(msg)).toBe('[Security Engineer]: AES-256 is recommended.')
    })

    it('preserves multiword persona labels exactly', () => {
      const msg = makeMessage({
        role: 'assistant',
        content: 'Agreed.',
        personaLabel: 'Legal & Compliance Officer',
      })
      expect(formatWithIdentityHeader(msg)).toBe('[Legal & Compliance Officer]: Agreed.')
    })
  })

  describe('system role', () => {
    it('uses personaLabel for system messages (non-user role path)', () => {
      const msg = makeMessage({
        role: 'system',
        content: 'System initialised.',
        personaLabel: 'Orchestrator',
      })
      expect(formatWithIdentityHeader(msg)).toBe('[Orchestrator]: System initialised.')
    })
  })

  describe('content preservation', () => {
    it('preserves content with special characters exactly', () => {
      const content = 'Use `AES-256` and "bcrypt". Cost: $0.001 per call.'
      const msg = makeMessage({ role: 'assistant', content, personaLabel: 'Tech Lead' })
      expect(formatWithIdentityHeader(msg)).toBe(`[Tech Lead]: ${content}`)
    })

    it('preserves multiline content without alteration', () => {
      const content = 'Line one.\nLine two.\nLine three.'
      const msg = makeMessage({ role: 'user', content })
      expect(formatWithIdentityHeader(msg)).toBe(`[You]: ${content}`)
    })

    it('preserves empty content string', () => {
      const msg = makeMessage({ role: 'assistant', content: '', personaLabel: 'Advisor' })
      expect(formatWithIdentityHeader(msg)).toBe('[Advisor]: ')
    })
  })
})

// ---------------------------------------------------------------------------
// formatThreadForAgent
// ---------------------------------------------------------------------------

describe('formatThreadForAgent', () => {
  it('returns an empty string for an empty messages array', () => {
    expect(formatThreadForAgent([])).toBe('')
  })

  it('formats a single message without a trailing separator', () => {
    const msg = makeMessage({ role: 'user', content: 'Just one message.' })
    const result = formatThreadForAgent([msg])
    expect(result).toBe('[You]: Just one message.')
    expect(result.endsWith('\n\n')).toBe(false)
  })

  it('joins two messages with exactly \\n\\n', () => {
    const msg1 = makeMessage({ role: 'user', content: 'Question?' })
    const msg2 = makeMessage({ role: 'assistant', content: 'Answer.', personaLabel: 'Expert' })
    const result = formatThreadForAgent([msg1, msg2])
    expect(result).toBe('[You]: Question?\n\n[Expert]: Answer.')
  })

  it('uses the correct separator count for three messages', () => {
    const msgs = [
      makeMessage({ role: 'user', content: 'A' }),
      makeMessage({ role: 'assistant', content: 'B', personaLabel: 'P1' }),
      makeMessage({ role: 'assistant', content: 'C', personaLabel: 'P2' }),
    ]
    const result = formatThreadForAgent(msgs)
    // Two separators for three messages
    const parts = result.split('\n\n')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBe('[You]: A')
    expect(parts[1]).toBe('[P1]: B')
    expect(parts[2]).toBe('[P2]: C')
  })

  it('applies identity header formatting to each message in the thread', () => {
    const msgs = [
      makeMessage({ role: 'user', content: 'Hi', personaLabel: 'HumanName' }),
      makeMessage({ role: 'assistant', content: 'Hello', personaLabel: 'AI Advisor' }),
    ]
    const result = formatThreadForAgent(msgs)
    expect(result).toContain('[You]: Hi')
    expect(result).toContain('[AI Advisor]: Hello')
    expect(result).not.toContain('HumanName')
  })
})

// ---------------------------------------------------------------------------
// stripMentions
// ---------------------------------------------------------------------------

describe('stripMentions', () => {
  it('removes a single @mention from a sentence', () => {
    expect(stripMentions('@SecurityAdvisor what do you think?')).toBe('what do you think?')
  })

  it('removes multiple @mentions from a sentence', () => {
    expect(stripMentions('@Alice and @Bob please review this.')).toBe('and please review this.')
  })

  it('preserves words that are not mentions', () => {
    expect(stripMentions('Hello @advisor how are you?')).toBe('Hello how are you?')
  })

  it('collapses multiple spaces left after removal into a single space', () => {
    // "@advisor" removed leaves two spaces adjacent to "hello" and "there"
    const result = stripMentions('hello @advisor there')
    expect(result).toBe('hello there')
  })

  it('trims leading whitespace when mention is at the start', () => {
    expect(stripMentions('@Mention starts sentence')).toBe('starts sentence')
  })

  it('returns an empty string when content is only a mention', () => {
    expect(stripMentions('@OnlyMention')).toBe('')
  })

  it('returns an empty string when content is only multiple mentions', () => {
    expect(stripMentions('@One @Two @Three')).toBe('')
  })

  it('does not alter content with no mentions', () => {
    expect(stripMentions('Plain text without any mentions.')).toBe(
      'Plain text without any mentions.',
    )
  })

  it('handles mentions with hyphens (e.g. @my-advisor)', () => {
    // stripMentions uses /@\w[\w-]*/g — hyphenated handles included
    const result = stripMentions('@my-advisor please look at this')
    expect(result).toBe('please look at this')
  })

  it('trims trailing whitespace after removal', () => {
    expect(stripMentions('some text @trailing')).toBe('some text')
  })

  it('handles an empty string input gracefully', () => {
    expect(stripMentions('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// extractMentions
// ---------------------------------------------------------------------------

describe('extractMentions', () => {
  it('returns an empty array when there are no mentions', () => {
    expect(extractMentions('No mentions here at all.')).toEqual([])
  })

  it('returns an empty array for an empty string', () => {
    expect(extractMentions('')).toEqual([])
  })

  it('extracts a single mention without the @ prefix', () => {
    const mentions = extractMentions('Hey @SecurityAdvisor, thoughts?')
    expect(mentions).toEqual(['SecurityAdvisor'])
  })

  it('extracts multiple mentions without the @ prefix', () => {
    const mentions = extractMentions('@Alice and @Bob please weigh in.')
    expect(mentions).toEqual(['Alice', 'Bob'])
  })

  it('extracts hyphenated mention names as a single token', () => {
    const mentions = extractMentions('@my-advisor should review this')
    expect(mentions).toEqual(['my-advisor'])
  })

  it('extracts mention at end of string', () => {
    const mentions = extractMentions('Directed to @Coordinator')
    expect(mentions).toEqual(['Coordinator'])
  })

  it('extracts all three mentions from a message with mixed content', () => {
    const mentions = extractMentions('@LegalCounsel @TechLead what are your thoughts on @DevOps?')
    expect(mentions).toEqual(['LegalCounsel', 'TechLead', 'DevOps'])
  })

  it('does not include the @ symbol in any extracted mention', () => {
    const mentions = extractMentions('@Alice @Bob')
    for (const m of mentions) {
      expect(m.startsWith('@')).toBe(false)
    }
  })

  it('returns readonly-compatible array (no mutation needed, length is correct)', () => {
    const mentions = extractMentions('@X @Y @Z')
    expect(mentions).toHaveLength(3)
  })

  it('does not match a lone @ sign with no following word character', () => {
    // "@ " alone should not be captured — regex requires \w after @
    const mentions = extractMentions('Price: $ @ market rate')
    expect(mentions).toEqual([])
  })
})
