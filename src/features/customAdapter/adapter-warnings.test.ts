import { describe, it, expect } from 'vitest'
import { getAdapterWarnings } from './adapter-warnings'
import type { CustomRequestTemplate, CustomResponseTemplate } from '@/types'

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<CustomRequestTemplate> = {}): CustomRequestTemplate {
  return {
    url: 'https://api.example.com/v1/chat',
    urlModelInterpolation: false,
    authHeaderName: 'Authorization',
    authHeaderValuePrefix: 'Bearer ',
    extraHeaders: {},
    body: {
      modelField: 'model',
      maxTokensField: 'max_tokens',
      streamField: 'stream',
      streamValue: true,
      systemPromptPlacement: 'top-level',
      systemPromptPath: 'system',
      messagesField: 'messages',
      roleField: 'role',
      contentField: 'content',
      roleMapping: {},
      extraFields: {},
    },
    ...overrides,
  }
}

function makeResponse(overrides: Partial<CustomResponseTemplate> = {}): CustomResponseTemplate {
  return {
    streamFormat: 'sse',
    contentPath: 'choices[0].delta.content',
    doneSentinel: '[DONE]',
    doneFieldPath: null,
    eventTypeField: null,
    contentEventType: null,
    doneEventType: null,
    errorEventType: null,
    errorMessagePath: null,
    inputTokensPath: null,
    outputTokensPath: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Valid config — no warnings
// ---------------------------------------------------------------------------

describe('getAdapterWarnings — valid configuration', () => {
  it('returns no warnings for a fully populated, correct config', () => {
    const warnings = getAdapterWarnings('My Adapter', makeRequest(), makeResponse())
    expect(warnings).toHaveLength(0)
  })

  it('returns no warnings when doneFieldPath is used instead of doneSentinel', () => {
    const response = makeResponse({ doneSentinel: null, doneFieldPath: 'choices[0].finish_reason' })
    const warnings = getAdapterWarnings('My Adapter', makeRequest(), response)
    expect(warnings).toHaveLength(0)
  })

  it('returns no warnings when doneEventType is used instead of doneSentinel', () => {
    const response = makeResponse({ doneSentinel: null, doneEventType: 'message_stop' })
    const warnings = getAdapterWarnings('My Adapter', makeRequest(), response)
    expect(warnings).toHaveLength(0)
  })

  it('does not warn about URL when URL is an empty string (empty means not yet set)', () => {
    // The rule only fires when url !== '' AND it doesn't start with http/https
    const warnings = getAdapterWarnings('My Adapter', makeRequest({ url: '' }), makeResponse())
    const urlWarnings = warnings.filter((w) => w.field === 'URL')
    expect(urlWarnings).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Bad URL
// ---------------------------------------------------------------------------

describe('getAdapterWarnings — invalid URL', () => {
  it('warns when URL is a bare hostname without a scheme', () => {
    const warnings = getAdapterWarnings('Bad URL', makeRequest({ url: 'api.example.com/v1' }), makeResponse())
    const urlWarning = warnings.find((w) => w.field === 'URL')
    expect(urlWarning).toBeDefined()
    expect(urlWarning!.message).toMatch(/http/)
  })

  it('warns when URL uses an unsupported scheme', () => {
    const warnings = getAdapterWarnings('Bad URL', makeRequest({ url: 'ftp://api.example.com' }), makeResponse())
    const urlWarning = warnings.find((w) => w.field === 'URL')
    expect(urlWarning).toBeDefined()
  })

  it('does not warn when URL uses https://', () => {
    const warnings = getAdapterWarnings('OK', makeRequest({ url: 'https://api.example.com' }), makeResponse())
    expect(warnings.find((w) => w.field === 'URL')).toBeUndefined()
  })

  it('does not warn when URL uses http://', () => {
    const warnings = getAdapterWarnings('OK', makeRequest({ url: 'http://localhost:8080' }), makeResponse())
    expect(warnings.find((w) => w.field === 'URL')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Missing auth header
// ---------------------------------------------------------------------------

describe('getAdapterWarnings — missing auth header', () => {
  it('warns when authHeaderName is an empty string', () => {
    const warnings = getAdapterWarnings('No Auth', makeRequest({ authHeaderName: '' }), makeResponse())
    const authWarning = warnings.find((w) => w.field === 'Auth Header')
    expect(authWarning).toBeDefined()
    expect(authWarning!.message).toMatch(/authenticate/i)
  })

  it('does not warn when authHeaderName is non-empty', () => {
    const warnings = getAdapterWarnings('OK', makeRequest({ authHeaderName: 'x-api-key' }), makeResponse())
    expect(warnings.find((w) => w.field === 'Auth Header')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Empty content path
// ---------------------------------------------------------------------------

describe('getAdapterWarnings — empty content path', () => {
  it('warns when contentPath is an empty string', () => {
    const warnings = getAdapterWarnings('No Content', makeRequest(), makeResponse({ contentPath: '' }))
    const contentWarning = warnings.find((w) => w.field === 'Content Path')
    expect(contentWarning).toBeDefined()
    expect(contentWarning!.message).toMatch(/extract/i)
  })

  it('does not warn when contentPath is non-empty', () => {
    const warnings = getAdapterWarnings('OK', makeRequest(), makeResponse({ contentPath: 'delta.content' }))
    expect(warnings.find((w) => w.field === 'Content Path')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Missing done signal
// ---------------------------------------------------------------------------

describe('getAdapterWarnings — missing done signal', () => {
  it('warns when all three done-signal fields are null', () => {
    const response = makeResponse({ doneSentinel: null, doneFieldPath: null, doneEventType: null })
    const warnings = getAdapterWarnings('No Done', makeRequest(), response)
    const doneWarning = warnings.find((w) => w.field === 'Done Signal')
    expect(doneWarning).toBeDefined()
    expect(doneWarning!.message).toMatch(/terminate/i)
  })

  it('does not warn when only doneSentinel is set', () => {
    const response = makeResponse({ doneSentinel: '[DONE]', doneFieldPath: null, doneEventType: null })
    const warnings = getAdapterWarnings('OK', makeRequest(), response)
    expect(warnings.find((w) => w.field === 'Done Signal')).toBeUndefined()
  })

  it('does not warn when only doneFieldPath is set', () => {
    const response = makeResponse({ doneSentinel: null, doneFieldPath: 'finish_reason', doneEventType: null })
    const warnings = getAdapterWarnings('OK', makeRequest(), response)
    expect(warnings.find((w) => w.field === 'Done Signal')).toBeUndefined()
  })

  it('does not warn when only doneEventType is set', () => {
    const response = makeResponse({ doneSentinel: null, doneFieldPath: null, doneEventType: 'message_stop' })
    const warnings = getAdapterWarnings('OK', makeRequest(), response)
    expect(warnings.find((w) => w.field === 'Done Signal')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Unrecognized stream format
// ---------------------------------------------------------------------------

describe('getAdapterWarnings — stream format', () => {
  it('warns when streamFormat is not "sse" or "ndjson"', () => {
    // The type is a union but at runtime a bad value could arrive from user input
    const response = makeResponse({ streamFormat: 'jsonlines' as 'sse' | 'ndjson' })
    const warnings = getAdapterWarnings('Bad Format', makeRequest(), response)
    const fmtWarning = warnings.find((w) => w.field === 'Stream Format')
    expect(fmtWarning).toBeDefined()
    expect(fmtWarning!.message).toContain('jsonlines')
  })

  it('does not warn for "sse"', () => {
    const warnings = getAdapterWarnings('OK', makeRequest(), makeResponse({ streamFormat: 'sse' }))
    expect(warnings.find((w) => w.field === 'Stream Format')).toBeUndefined()
  })

  it('does not warn for "ndjson"', () => {
    const warnings = getAdapterWarnings('OK', makeRequest(), makeResponse({ streamFormat: 'ndjson' }))
    expect(warnings.find((w) => w.field === 'Stream Format')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Multiple warnings simultaneously
// ---------------------------------------------------------------------------

describe('getAdapterWarnings — multiple warnings at once', () => {
  it('accumulates all applicable warnings in a single call', () => {
    const badRequest = makeRequest({ url: 'api.example.com', authHeaderName: '' })
    const badResponse = makeResponse({
      contentPath: '',
      doneSentinel: null,
      doneFieldPath: null,
      doneEventType: null,
    })

    const warnings = getAdapterWarnings('Broken Adapter', badRequest, badResponse)

    const fields = warnings.map((w) => w.field)
    expect(fields).toContain('URL')
    expect(fields).toContain('Auth Header')
    expect(fields).toContain('Content Path')
    expect(fields).toContain('Done Signal')
    // At least 4 distinct warnings
    expect(warnings.length).toBeGreaterThanOrEqual(4)
  })

  it('returns warnings for missing model and messages fields', () => {
    const badBody = {
      modelField: '',
      maxTokensField: 'max_tokens',
      streamField: 'stream',
      streamValue: true,
      systemPromptPlacement: 'top-level' as const,
      systemPromptPath: 'system',
      messagesField: '',
      roleField: 'role',
      contentField: 'content',
      roleMapping: {},
      extraFields: {},
    }
    const req = makeRequest({ body: badBody })
    const warnings = getAdapterWarnings('Missing Fields', req, makeResponse())

    const fields = warnings.map((w) => w.field)
    expect(fields).toContain('Model Field')
    expect(fields).toContain('Messages Field')
  })
})
