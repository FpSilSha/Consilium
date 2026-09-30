import type { LocalAgentErrorCode, LocalAgentUsage } from '../../../shared/local-agent/protocol'

export type ParserOutput =
  | { readonly kind: 'text'; readonly text: string }
  /** Isolation failed: the runner must stop the child immediately. Emitted once. */
  | { readonly kind: 'fatal'; readonly message: string }

/**
 * What the stream said, before the process exit code is known. The runner
 * only turns `success` into a `completed` event once the child has also
 * exited with code 0.
 */
export type StreamOutcome =
  | { readonly kind: 'success'; readonly usage?: LocalAgentUsage | undefined }
  | {
      readonly kind: 'error'
      readonly code: LocalAgentErrorCode
      readonly message: string
      readonly retryable: boolean
      readonly usage?: LocalAgentUsage | undefined
    }

export interface StreamParser {
  push(line: string): readonly ParserOutput[]
  outcome(): StreamOutcome
  /** Usage from the result event, if one has arrived. */
  latestUsage(): LocalAgentUsage | undefined
}

type Json = Record<string, unknown>

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A valid token count, or undefined when absent or malformed (never coerced to 0). */
function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

/**
 * Only counters the runtime actually reported are kept. The input total is
 * reported only when all three input components are known.
 */
function usageFrom(raw: unknown): LocalAgentUsage | undefined {
  if (!isRecord(raw)) return undefined
  const uncached = count(raw['input_tokens'])
  const cacheRead = count(raw['cache_read_input_tokens'])
  const cacheWrite = count(raw['cache_creation_input_tokens'])
  const output = count(raw['output_tokens'])
  const inputTotal = uncached !== undefined && cacheRead !== undefined && cacheWrite !== undefined
    ? uncached + cacheRead + cacheWrite
    : undefined
  if (inputTotal === undefined && output === undefined && cacheRead === undefined && cacheWrite === undefined) {
    return undefined
  }
  return {
    billing: 'subscription',
    source: 'runtime-reported',
    ...(inputTotal !== undefined ? { inputTokens: inputTotal } : {}),
    ...(output !== undefined ? { outputTokens: output } : {}),
    ...(cacheRead !== undefined ? { cacheReadTokens: cacheRead } : {}),
    ...(cacheWrite !== undefined ? { cacheWriteTokens: cacheWrite } : {}),
  }
}

function classifyError(apiError: string | undefined, message: string): { code: LocalAgentErrorCode; retryable: boolean } {
  const lower = message.toLowerCase()
  if (apiError === 'authentication_failed' || lower.includes('failed to authenticate') || lower.includes('oauth')) {
    return { code: 'signed-out', retryable: false }
  }
  if (apiError?.startsWith('rate_limit') === true || lower.includes('usage limit') || lower.includes('rate limit')) {
    return { code: 'rate-limited', retryable: true }
  }
  return { code: 'unknown', retryable: false }
}

function isolationProblem(init: Json): string | null {
  const tools = init['tools']
  if (!Array.isArray(tools) || tools.length > 0) return 'Claude Code started with tools enabled'
  const mcp = init['mcp_servers']
  if (!Array.isArray(mcp) || mcp.length > 0) return 'Claude Code started with MCP servers'
  if (init['apiKeySource'] !== 'none') return 'Claude Code is using an API key instead of the subscription login'
  return null
}

/**
 * Parses `claude -p --output-format stream-json --include-partial-messages`.
 *
 * Fails closed: nothing is streamed until an `init` event confirms no tools,
 * no MCP servers and no API key. The result's `subtype` is ignored because
 * the runtime reports `"success"` even for failed calls; `is_error` decides.
 */
export function createStreamParser(): StreamParser {
  let initVerified = false
  let isolationFailure: string | null = null
  let sawDelta = false
  let fallbackText = ''
  let apiError: string | undefined
  let result: Json | null = null

  function failIsolation(message: string): ParserOutput[] {
    isolationFailure = message
    return [{ kind: 'fatal', message }]
  }

  function handle(event: Json): ParserOutput[] {
    const type = event['type']

    if (type === 'system' && event['subtype'] === 'init') {
      const problem = isolationProblem(event)
      if (problem !== null) return failIsolation(problem)
      initVerified = true
      return []
    }

    if (type === 'result') {
      result = event
      // A whole assistant message with no partial deltas: emit it once, now.
      const failed = event['is_error'] === true || apiError !== undefined
      return initVerified && !sawDelta && !failed && fallbackText !== ''
        ? [{ kind: 'text', text: fallbackText }]
        : []
    }

    if (!initVerified) {
      return type === 'stream_event' || type === 'assistant'
        ? failIsolation('Claude Code sent output before confirming its isolated configuration')
        : []
    }

    if (type === 'stream_event') {
      const inner = event['event']
      if (!isRecord(inner) || inner['type'] !== 'content_block_delta') return []
      const delta = inner['delta']
      if (!isRecord(delta) || delta['type'] !== 'text_delta' || typeof delta['text'] !== 'string') return []
      if (apiError !== undefined) return []
      sawDelta = true
      return [{ kind: 'text', text: delta['text'] }]
    }

    if (type === 'assistant') {
      if (typeof event['error'] === 'string') {
        apiError = event['error']
        return []
      }
      const message = event['message']
      if (!isRecord(message) || !Array.isArray(message['content'])) return []
      for (const block of message['content']) {
        if (isRecord(block) && block['type'] === 'text' && typeof block['text'] === 'string') {
          fallbackText += block['text']
        }
      }
    }
    return []
  }

  return {
    push(line) {
      const trimmed = line.trim()
      if (trimmed === '' || isolationFailure !== null) return []
      let parsed: unknown
      try {
        parsed = JSON.parse(trimmed)
      } catch {
        return []
      }
      return isRecord(parsed) ? handle(parsed) : []
    },

    outcome() {
      const usage = result !== null ? usageFrom(result['usage']) : undefined
      if (isolationFailure !== null) {
        return { kind: 'error', code: 'isolation-failed', message: isolationFailure, retryable: false, usage }
      }
      if (result === null) {
        return { kind: 'error', code: 'protocol', message: 'Claude Code ended without a result', retryable: true, usage }
      }
      if (result['is_error'] === true || apiError !== undefined) {
        const text = typeof result['result'] === 'string' ? result['result'] : 'Claude Code reported an error'
        // Not truncated here: the runner redacts first, so a term can't be cut in half.
        return { kind: 'error', ...classifyError(apiError, text), message: text, usage }
      }
      // Success needs positive evidence: a verified init and an explicit is_error: false.
      if (!initVerified || result['is_error'] !== false) {
        return { kind: 'error', code: 'protocol', message: 'Claude Code returned an incomplete result', retryable: true, usage }
      }
      return { kind: 'success', ...(usage !== undefined ? { usage } : {}) }
    },

    latestUsage() {
      return result !== null ? usageFrom(result['usage']) : undefined
    },
  }
}
