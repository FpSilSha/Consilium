import { describe, it, expect } from 'vitest'
import { deserializeSession, extractMetadata } from './session-serializer'
import type { SessionFile } from './session-types'

// ---------------------------------------------------------------------------
// Shared valid minimal fixture
// ---------------------------------------------------------------------------

/** Returns a fresh deep copy of a fully valid minimal SessionFile object */
function makeValidSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    id: 'session-abc-123',
    name: 'My Test Session',
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
    windows: [],
    messages: [],
    archivedMessages: [],
    queue: [],
    turnMode: 'sequential',
    sessionInstructions: '',
    totalCost: 0,
    inputFiles: [],
    outputFiles: [],
    ...overrides,
  }
}

function toJson(obj: Record<string, unknown>): string {
  return JSON.stringify(obj)
}

// ---------------------------------------------------------------------------
// deserializeSession
// ---------------------------------------------------------------------------

describe('deserializeSession', () => {
  describe('valid sessions', () => {
    it('accepts a minimal valid session and returns a parsed object', () => {
      const result = deserializeSession(toJson(makeValidSession()))
      expect(result).not.toBeNull()
      expect(result?.id).toBe('session-abc-123')
      expect(result?.version).toBe(1)
    })

    it('parses all top-level fields correctly', () => {
      const fixture = makeValidSession()
      const result = deserializeSession(toJson(fixture))
      expect(result?.name).toBe('My Test Session')
      expect(result?.createdAt).toBe(1700000000000)
      expect(result?.updatedAt).toBe(1700000001000)
    })

    it('accepts empty arrays for windows, messages, archivedMessages, and queue', () => {
      const result = deserializeSession(toJson(makeValidSession()))
      expect(result?.windows).toEqual([])
      expect(result?.messages).toEqual([])
      expect(result?.archivedMessages).toEqual([])
      expect(result?.queue).toEqual([])
    })

    it('accepts a window with valid id and model fields (plus extra fields)', () => {
      const fixture = makeValidSession({
        windows: [
          { id: 'win-1', model: 'claude-opus-4-6', provider: 'anthropic', extra: 'ignored' },
        ],
      })
      const result = deserializeSession(toJson(fixture))
      expect(result?.windows).toHaveLength(1)
    })

    it('accepts a message with valid id, role, content fields (plus extra fields)', () => {
      const fixture = makeValidSession({
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello world',
            personaLabel: 'You',
            timestamp: 1700000000000,
            windowId: 'win-1',
          },
        ],
      })
      const result = deserializeSession(toJson(fixture))
      expect(result?.messages).toHaveLength(1)
    })

    it('accepts queue cards with null errorLabel, string errorLabel, and isUser variants', () => {
      const fixture = makeValidSession({
        queue: [
          { id: 'q-1', windowId: 'win-1', status: 'waiting', isUser: false, errorLabel: null },
          { id: 'q-2', windowId: 'win-1', status: 'errored', isUser: false, errorLabel: 'Rate limit' },
          { id: 'q-3', windowId: 'win-1', status: 'waiting', isUser: true, errorLabel: null },
        ],
      })
      const result = deserializeSession(toJson(fixture))
      expect(result?.queue).toHaveLength(3)
    })

    it('accepts extra unknown top-level fields (lenient validation)', () => {
      const fixture = makeValidSession({ unknownField: 'whatever', anotherExtra: 42 })
      const result = deserializeSession(toJson(fixture))
      expect(result).not.toBeNull()
    })

    it('accepts archivedMessages with valid message shapes', () => {
      const fixture = makeValidSession({
        archivedMessages: [
          { id: 'arch-1', role: 'assistant', content: 'archived reply', personaLabel: 'Advisor' },
        ],
      })
      const result = deserializeSession(toJson(fixture))
      expect(result).not.toBeNull()
    })
  })

  describe('invalid JSON', () => {
    it('returns null for a completely malformed JSON string', () => {
      expect(deserializeSession('not json at all')).toBeNull()
    })

    it('returns null for an empty string', () => {
      expect(deserializeSession('')).toBeNull()
    })

    it('returns null for a truncated JSON string', () => {
      expect(deserializeSession('{"version": 1, "id": "x"')).toBeNull()
    })
  })

  describe('missing required top-level fields', () => {
    it('returns null when id is missing', () => {
      const { id: _id, ...fixture } = makeValidSession() as { id: string } & Record<string, unknown>
      expect(deserializeSession(toJson(fixture))).toBeNull()
    })

    it('returns null when windows array is missing', () => {
      const { windows: _w, ...fixture } = makeValidSession() as { windows: unknown[] } & Record<string, unknown>
      expect(deserializeSession(toJson(fixture))).toBeNull()
    })

    it('returns null when messages array is missing', () => {
      const { messages: _m, ...fixture } = makeValidSession() as { messages: unknown[] } & Record<string, unknown>
      expect(deserializeSession(toJson(fixture))).toBeNull()
    })

    it('returns null when archivedMessages is missing', () => {
      const { archivedMessages: _a, ...fixture } = makeValidSession() as { archivedMessages: unknown[] } & Record<string, unknown>
      expect(deserializeSession(toJson(fixture))).toBeNull()
    })

    it('returns null when queue is missing', () => {
      const { queue: _q, ...fixture } = makeValidSession() as { queue: unknown[] } & Record<string, unknown>
      expect(deserializeSession(toJson(fixture))).toBeNull()
    })

    it('returns null when name is missing', () => {
      const { name: _n, ...fixture } = makeValidSession() as { name: string } & Record<string, unknown>
      expect(deserializeSession(toJson(fixture))).toBeNull()
    })

    it('returns null when createdAt is missing', () => {
      const { createdAt: _c, ...fixture } = makeValidSession() as { createdAt: number } & Record<string, unknown>
      expect(deserializeSession(toJson(fixture))).toBeNull()
    })
  })

  describe('wrong version', () => {
    it('returns null when version is 2', () => {
      expect(deserializeSession(toJson(makeValidSession({ version: 2 })))).toBeNull()
    })

    it('returns null when version is 0', () => {
      expect(deserializeSession(toJson(makeValidSession({ version: 0 })))).toBeNull()
    })

    it('returns null when version is a string "1"', () => {
      expect(deserializeSession(toJson(makeValidSession({ version: '1' })))).toBeNull()
    })
  })

  describe('invalid window shapes', () => {
    it('returns null when a window is missing id', () => {
      const fixture = makeValidSession({
        windows: [{ model: 'gpt-4o' }],
      })
      expect(deserializeSession(toJson(fixture))).toBeNull()
    })

    it('returns null when a window is missing model', () => {
      const fixture = makeValidSession({
        windows: [{ id: 'win-1' }],
      })
      expect(deserializeSession(toJson(fixture))).toBeNull()
    })

    it('returns null when a window entry is null', () => {
      const fixture = makeValidSession({ windows: [null] })
      expect(deserializeSession(toJson(fixture))).toBeNull()
    })

    it('returns null when a window entry is a primitive string', () => {
      const fixture = makeValidSession({ windows: ['bad-entry'] })
      expect(deserializeSession(toJson(fixture))).toBeNull()
    })
  })

  describe('invalid message shapes', () => {
    it('returns null when a message is missing id', () => {
      const fixture = makeValidSession({
        messages: [{ role: 'user', content: 'hi' }],
      })
      expect(deserializeSession(toJson(fixture))).toBeNull()
    })

    it('returns null when a message is missing role', () => {
      const fixture = makeValidSession({
        messages: [{ id: 'msg-1', content: 'hi' }],
      })
      expect(deserializeSession(toJson(fixture))).toBeNull()
    })

    it('returns null when a message is missing content', () => {
      const fixture = makeValidSession({
        messages: [{ id: 'msg-1', role: 'user' }],
      })
      expect(deserializeSession(toJson(fixture))).toBeNull()
    })
  })

  describe('invalid archivedMessages shapes', () => {
    it('returns null when an archived message is missing role', () => {
      const fixture = makeValidSession({
        archivedMessages: [{ id: 'arch-1', content: 'text' }],
      })
      expect(deserializeSession(toJson(fixture))).toBeNull()
    })
  })

  describe('invalid queue card shapes', () => {
    it('returns null when a queue card is missing isUser', () => {
      const fixture = makeValidSession({
        queue: [{ id: 'q-1', windowId: 'win-1', status: 'waiting', errorLabel: null }],
      })
      expect(deserializeSession(toJson(fixture))).toBeNull()
    })

    it('returns null when errorLabel is a number (must be string or null)', () => {
      const fixture = makeValidSession({
        queue: [{ id: 'q-1', windowId: 'win-1', status: 'errored', isUser: false, errorLabel: 42 }],
      })
      expect(deserializeSession(toJson(fixture))).toBeNull()
    })

    it('returns null when errorLabel is a boolean', () => {
      const fixture = makeValidSession({
        queue: [{ id: 'q-1', windowId: 'win-1', status: 'errored', isUser: false, errorLabel: false }],
      })
      expect(deserializeSession(toJson(fixture))).toBeNull()
    })

    it('returns null when a queue card is missing windowId', () => {
      const fixture = makeValidSession({
        queue: [{ id: 'q-1', status: 'waiting', isUser: true, errorLabel: null }],
      })
      expect(deserializeSession(toJson(fixture))).toBeNull()
    })

    it('returns null when a queue card is missing status', () => {
      const fixture = makeValidSession({
        queue: [{ id: 'q-1', windowId: 'win-1', isUser: true, errorLabel: null }],
      })
      expect(deserializeSession(toJson(fixture))).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// extractMetadata
// ---------------------------------------------------------------------------

describe('extractMetadata', () => {
  function makeTypedSession(overrides: Partial<SessionFile> = {}): SessionFile {
    return {
      version: 1,
      id: 'sess-meta-test',
      name: 'Metadata Test Session',
      createdAt: 1700000000000,
      updatedAt: 1700000099000,
      windows: [],
      messages: [],
      archivedMessages: [],
      queue: [],
      turnMode: 'parallel',
      sessionInstructions: 'be concise',
      totalCost: 3.75,
      inputFiles: [],
      outputFiles: [],
      ...overrides,
    } as SessionFile
  }

  it('maps all scalar fields from SessionFile to metadata', () => {
    const meta = extractMetadata(makeTypedSession())
    expect(meta.id).toBe('sess-meta-test')
    expect(meta.name).toBe('Metadata Test Session')
    expect(meta.createdAt).toBe(1700000000000)
    expect(meta.updatedAt).toBe(1700000099000)
    expect(meta.totalCost).toBe(3.75)
    expect(meta.windowCount).toBe(0)
    expect(meta.messageCount).toBe(0)
  })

  it('counts windows and messages from populated arrays', () => {
    const session = makeTypedSession({
      windows: [
        { id: 'w1', model: 'm', provider: 'anthropic', keyId: 'k', personaId: 'p', personaLabel: 'l', personaFilename: 'f', accentColor: '#fff', runningCost: 0, isCompacted: false, bufferSize: 0 },
        { id: 'w2', model: 'm', provider: 'openai', keyId: 'k', personaId: 'p', personaLabel: 'l', personaFilename: 'f', accentColor: '#000', runningCost: 1, isCompacted: false, bufferSize: 0 },
      ],
      messages: [
        { id: 'm1', role: 'user', content: 'hi', personaLabel: 'You', timestamp: 0, windowId: 'w1' },
        { id: 'm2', role: 'assistant', content: 'hello', personaLabel: 'AI', timestamp: 1, windowId: 'w1' },
        { id: 'm3', role: 'user', content: 'thanks', personaLabel: 'You', timestamp: 2, windowId: 'w1' },
      ],
    })
    const meta = extractMetadata(session)
    expect(meta.windowCount).toBe(2)
    expect(meta.messageCount).toBe(3)
  })

  it('returns exactly 7 fields (no extra leakage from SessionFile)', () => {
    const meta = extractMetadata(makeTypedSession())
    const keys = Object.keys(meta)
    expect(keys).toHaveLength(7)
    expect(keys.sort()).toEqual(
      ['createdAt', 'id', 'messageCount', 'name', 'totalCost', 'updatedAt', 'windowCount'].sort(),
    )
  })
})
