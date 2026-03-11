import { describe, it, expect } from 'vitest'
import type { Message, AdvisorWindow } from '@/types'
import {
  estimateThreadTokens,
  shouldCompact,
  splitForCompaction,
  buildSummaryPrompt,
  buildCompactedContext,
  getContextUsagePercent,
} from '@/features/compaction/compaction-engine'
import { estimateTokens } from '@/services/tokenizer/char-estimator'
import { formatWithIdentityHeader } from '@/services/context-bus/identity-headers'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<Message> & { content: string }): Message {
  return {
    id: 'msg-1',
    role: 'user',
    content: overrides.content,
    personaLabel: 'You',
    timestamp: 1_000_000,
    windowId: 'win-1',
    ...overrides,
  }
}

function makeWindow(model: string): AdvisorWindow {
  return {
    id: 'win-1',
    provider: 'anthropic',
    keyId: 'key-1',
    model,
    personaId: 'persona-1',
    personaLabel: 'Advisor',
    accentColor: '#000',
    runningCost: 0,
    isStreaming: false,
    streamContent: '',
    error: null,
    isCompacted: false,
    compactedSummary: null,
    bufferSize: 10,
  }
}

// ---------------------------------------------------------------------------
// estimateThreadTokens
// ---------------------------------------------------------------------------

describe('estimateThreadTokens', () => {
  it('returns 0 for an empty message list', () => {
    expect(estimateThreadTokens([])).toBe(0)
  })

  it('matches the sum of estimateTokens(formatWithIdentityHeader(msg)) for a user message', () => {
    const msg = makeMessage({ content: 'hello' })
    const formatted = formatWithIdentityHeader(msg) // "[You]: hello"
    const expected = estimateTokens(formatted)
    expect(estimateThreadTokens([msg])).toBe(expected)
  })

  it('formats assistant messages using personaLabel, not "You"', () => {
    const msg = makeMessage({ role: 'assistant', content: 'roger that', personaLabel: 'SecurityBot' })
    const formatted = formatWithIdentityHeader(msg) // "[SecurityBot]: roger that"
    const expected = estimateTokens(formatted)
    expect(estimateThreadTokens([msg])).toBe(expected)
  })

  it('sums tokens across multiple messages', () => {
    const msgs = [
      makeMessage({ id: 'a', content: 'first message' }),
      makeMessage({ id: 'b', role: 'assistant', content: 'second message', personaLabel: 'Advisor' }),
      makeMessage({ id: 'c', content: 'third message' }),
    ]
    const expected = msgs.reduce(
      (total, msg) => total + estimateTokens(formatWithIdentityHeader(msg)),
      0,
    )
    expect(estimateThreadTokens(msgs)).toBe(expected)
  })

  it('uses ceiling division so even a 1-char message contributes 1 token', () => {
    // "[You]: x" = 8 chars → Math.ceil(8/4) = 2
    const msg = makeMessage({ content: 'x' })
    expect(estimateThreadTokens([msg])).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// shouldCompact
// ---------------------------------------------------------------------------

describe('shouldCompact', () => {
  it('returns false for an unknown model ID', () => {
    const msgs = [makeMessage({ content: 'hello' })]
    const window = makeWindow('not-a-real-model-xyz')
    expect(shouldCompact(msgs, window)).toBe(false)
  })

  it('returns false when thread token count is well below 65% of context window', () => {
    // gpt-4o has contextWindow 128000; threshold = 83200 tokens
    // A few short messages will be nowhere near that
    const msgs = [
      makeMessage({ id: '1', content: 'hi' }),
      makeMessage({ id: '2', role: 'assistant', content: 'hello', personaLabel: 'Advisor' }),
    ]
    expect(shouldCompact(msgs, makeWindow('gpt-4o'))).toBe(false)
  })

  it('returns true when total tokens meet or exceed 65% of context window', () => {
    // gpt-4o: contextWindow=128000, threshold=83200 tokens → need >=332800 chars of formatted text
    // Build a single message whose content length pushes past the threshold.
    // "[You]: " prefix = 7 chars, so content must be >= 332800 - 7 = 332793 chars
    const longContent = 'a'.repeat(332793)
    const msgs = [makeMessage({ content: longContent })]
    expect(shouldCompact(msgs, makeWindow('gpt-4o'))).toBe(true)
  })

  it('returns true at exactly the 65% boundary', () => {
    // gpt-4o: threshold = 128000 * 0.65 = 83200 tokens
    // estimateTokens uses Math.ceil(len / 4), so we need Math.ceil(len/4) >= 83200
    // → len >= (83200 - 1) * 4 + 1 = 332797? Let's be precise:
    // We need exactly 83200 tokens → text length = 83200 * 4 = 332800 chars (Math.ceil(332800/4) = 83200)
    // "[You]: " = 7 chars → content = 332800 - 7 = 332793 chars
    const exactContent = 'b'.repeat(332793)
    const msgs = [makeMessage({ content: exactContent })]
    expect(shouldCompact(msgs, makeWindow('gpt-4o'))).toBe(true)
  })

  it('returns false for a 1-token-below-threshold message', () => {
    // Need tokens < 83200. "[You]: " = 7 chars.
    // Make content such that total formatted length = 332799 chars → Math.ceil(332799/4) = 83200, which is still >=
    // Actually: 83199 tokens needed → total chars = 83199 * 4 = 332796 chars → Math.ceil(332796/4) = 83199
    // content = 332796 - 7 = 332789 chars
    const belowContent = 'c'.repeat(332789)
    const msgs = [makeMessage({ content: belowContent })]
    expect(shouldCompact(msgs, makeWindow('gpt-4o'))).toBe(false)
  })

  it('works correctly with a large-context model (gemini-2.0-flash)', () => {
    // gemini-2.0-flash: contextWindow=1000000 — short messages must not trigger compaction
    const msgs = Array.from({ length: 10 }, (_, i) =>
      makeMessage({ id: `m${i}`, content: 'some moderate text here' }),
    )
    expect(shouldCompact(msgs, makeWindow('gemini-2.0-flash'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// splitForCompaction
// ---------------------------------------------------------------------------

describe('splitForCompaction', () => {
  const makeMessages = (count: number): readonly Message[] =>
    Array.from({ length: count }, (_, i) =>
      makeMessage({ id: `m${i}`, content: `message ${i}` }),
    )

  it('clamps bufferSize < 5 up to 5 so archive = messages.length - 5', () => {
    const msgs = makeMessages(10)
    const { archive, buffer } = splitForCompaction(msgs, 2)
    expect(archive).toHaveLength(5)   // 10 - 5
    expect(buffer).toHaveLength(5)
  })

  it('clamps bufferSize of 0 to 5', () => {
    const msgs = makeMessages(8)
    const { archive, buffer } = splitForCompaction(msgs, 0)
    expect(archive).toHaveLength(3)   // 8 - 5
    expect(buffer).toHaveLength(5)
  })

  it('returns all messages as buffer when bufferSize >= message count', () => {
    const msgs = makeMessages(6)
    const { archive, buffer } = splitForCompaction(msgs, 20)
    expect(archive).toHaveLength(0)
    expect(buffer).toHaveLength(6)
  })

  it('returns all messages as buffer when there are exactly bufferSize messages', () => {
    const msgs = makeMessages(7)
    const { archive, buffer } = splitForCompaction(msgs, 7)
    expect(archive).toHaveLength(0)
    expect(buffer).toHaveLength(7)
  })

  it('performs a normal split preserving message order', () => {
    const msgs = makeMessages(10)
    const { archive, buffer } = splitForCompaction(msgs, 6)
    expect(archive).toHaveLength(4)
    expect(buffer).toHaveLength(6)
    // archive contains the first 4, buffer the last 6
    expect(archive[0]).toBe(msgs[0])
    expect(archive[3]).toBe(msgs[3])
    expect(buffer[0]).toBe(msgs[4])
    expect(buffer[5]).toBe(msgs[9])
  })

  it('large bufferSize means a small archive when message count exceeds it', () => {
    const msgs = makeMessages(100)
    const { archive, buffer } = splitForCompaction(msgs, 90)
    expect(archive).toHaveLength(10)
    expect(buffer).toHaveLength(90)
  })

  it('empty message list returns empty archive and empty buffer', () => {
    const { archive, buffer } = splitForCompaction([], 5)
    expect(archive).toHaveLength(0)
    expect(buffer).toHaveLength(0)
  })

  it('clamps bufferSize at messages.length so buffer never overflows', () => {
    const msgs = makeMessages(3)  // fewer than the minimum clamp of 5
    const { archive, buffer } = splitForCompaction(msgs, 1)
    // effectiveBuffer = Math.min(Math.max(1, 5), 3) = Math.min(5, 3) = 3
    // splitPoint = 3 - 3 = 0 → all goes to buffer
    expect(archive).toHaveLength(0)
    expect(buffer).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// buildSummaryPrompt
// ---------------------------------------------------------------------------

describe('buildSummaryPrompt', () => {
  it('contains the required instruction keywords', () => {
    const msgs = [makeMessage({ content: 'what is 2+2?' })]
    const prompt = buildSummaryPrompt(msgs)
    expect(prompt).toContain('Summarize the following conversation concisely')
    expect(prompt).toContain('Key decisions and conclusions')
    expect(prompt).toContain('persona labels')
    expect(prompt).toContain('500 words')
  })

  it('includes formatted message content in the output', () => {
    const msg = makeMessage({ content: 'unique-content-xyz', role: 'assistant', personaLabel: 'Planner' })
    const prompt = buildSummaryPrompt([msg])
    // The formatted version is "[Planner]: unique-content-xyz"
    expect(prompt).toContain('[Planner]: unique-content-xyz')
  })

  it('formats multiple messages with a separator between them', () => {
    const msgs = [
      makeMessage({ id: 'a', content: 'first' }),
      makeMessage({ id: 'b', role: 'assistant', content: 'second', personaLabel: 'Advisor' }),
    ]
    const prompt = buildSummaryPrompt(msgs)
    expect(prompt).toContain('[You]: first')
    expect(prompt).toContain('[Advisor]: second')
  })

  it('separates instruction block from content with a --- divider', () => {
    const msgs = [makeMessage({ content: 'hello' })]
    const prompt = buildSummaryPrompt(msgs)
    expect(prompt).toContain('---')
  })

  it('returns a string with only the divider when given empty archive', () => {
    const prompt = buildSummaryPrompt([])
    expect(prompt).toContain('Summarize the following conversation')
    expect(typeof prompt).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// buildCompactedContext
// ---------------------------------------------------------------------------

describe('buildCompactedContext', () => {
  it('preamble contains the archive summary text', () => {
    const buffer = [makeMessage({ content: 'recent message' })]
    const { preamble } = buildCompactedContext('my archive summary', buffer)
    expect(preamble).toContain('my archive summary')
  })

  it('preamble contains both section headers', () => {
    const { preamble } = buildCompactedContext('summary', [])
    expect(preamble).toContain('Conversation History (Summarized)')
    expect(preamble).toContain('Recent Messages (Verbatim)')
  })

  it('recentMessages is the exact same array reference as the buffer passed in', () => {
    const buffer = [makeMessage({ content: 'a' }), makeMessage({ id: '2', content: 'b' })]
    const { recentMessages } = buildCompactedContext('summary', buffer)
    expect(recentMessages).toBe(buffer)
  })

  it('works with an empty buffer — recentMessages is empty', () => {
    const { recentMessages } = buildCompactedContext('compact summary', [])
    expect(recentMessages).toHaveLength(0)
  })

  it('works with an empty summary — preamble still has correct structure', () => {
    const { preamble } = buildCompactedContext('', [makeMessage({ content: 'hi' })])
    expect(preamble).toContain('Conversation History (Summarized)')
    expect(preamble).toContain('Recent Messages (Verbatim)')
  })

  it('preamble appears before recentMessages in the conceptual output order', () => {
    const buffer = [makeMessage({ content: 'recent' })]
    const { preamble, recentMessages } = buildCompactedContext('old stuff summarized', buffer)
    expect(preamble.indexOf('old stuff summarized')).toBeGreaterThanOrEqual(0)
    expect(recentMessages[0].content).toBe('recent')
  })
})

// ---------------------------------------------------------------------------
// getContextUsagePercent
// ---------------------------------------------------------------------------

describe('getContextUsagePercent', () => {
  it('returns 0 for an unknown model ID', () => {
    const msgs = [makeMessage({ content: 'hello' })]
    expect(getContextUsagePercent(msgs, 'fantasy-model-9000')).toBe(0)
  })

  it('returns 0 for an empty message list against a known model', () => {
    expect(getContextUsagePercent([], 'claude-opus-4-6')).toBe(0)
  })

  it('returns a value between 0 and 100 for a small thread', () => {
    const msgs = [makeMessage({ content: 'a short message' })]
    const pct = getContextUsagePercent(msgs, 'claude-opus-4-6')
    expect(pct).toBeGreaterThan(0)
    expect(pct).toBeLessThanOrEqual(100)
  })

  it('caps at 100 when token count exceeds contextWindow', () => {
    // Use gpt-4o-mini (contextWindow=128000). Create a message with enough content.
    // Need > 128000 tokens → > 512000 formatted chars.
    // "[You]: " = 7 chars, so content = 512000 chars gets us Math.ceil(512007/4)=128002 tokens
    const hugeContent = 'x'.repeat(512001)
    const msgs = [makeMessage({ content: hugeContent })]
    expect(getContextUsagePercent(msgs, 'gpt-4o-mini')).toBe(100)
  })

  it('calculates percentage correctly for a known input', () => {
    // claude-opus-4-6: contextWindow = 200000
    // "[You]: hello" = 12 chars → Math.ceil(12/4) = 3 tokens
    // percent = (3 / 200000) * 100 = 0.0015
    const msg = makeMessage({ content: 'hello' })
    const pct = getContextUsagePercent([msg], 'claude-opus-4-6')
    const formatted = formatWithIdentityHeader(msg)
    const tokens = estimateTokens(formatted)
    const expected = Math.min((tokens / 200000) * 100, 100)
    expect(pct).toBeCloseTo(expected, 10)
  })

  it('returns a non-zero value for gpt-4o with a moderate message', () => {
    const msgs = Array.from({ length: 5 }, (_, i) =>
      makeMessage({ id: `m${i}`, content: 'moderately sized message content here' }),
    )
    expect(getContextUsagePercent(msgs, 'gpt-4o')).toBeGreaterThan(0)
  })
})
