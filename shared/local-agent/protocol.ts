/**
 * Local-agent IPC protocol, shared by the Electron main process, preload, and
 * renderer. A local agent is a model runtime installed and signed in by the
 * user (e.g. the Claude Code CLI); Consilium never sees its credentials.
 *
 * Contract: one terminal event per request, strictly increasing `seq`, events
 * and cancellation bound to the requesting renderer, no API-billing fallback.
 */

export type LocalAgentRuntimeId = 'claude-code'

const RUNTIMES: readonly LocalAgentRuntimeId[] = ['claude-code']

export const LOCAL_AGENT_CHANNELS = {
  readiness: 'local-agent:readiness',
  start: 'local-agent:start',
  cancel: 'local-agent:cancel',
  event: 'local-agent:event',
} as const

export type LocalAgentReadiness =
  | { readonly state: 'not-installed' }
  | { readonly state: 'signed-out' }
  /** The runtime is authenticated, but not with a subscription (e.g. an API key). */
  | { readonly state: 'wrong-auth'; readonly detail: string }
  | { readonly state: 'ready'; readonly runtimeVersion: string; readonly plan?: string | undefined }
  | { readonly state: 'error'; readonly message: string }

export interface LocalAgentMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

export interface LocalAgentTurnRequest {
  readonly requestId: string
  readonly sessionId: string
  readonly generation: number
  readonly runtime: LocalAgentRuntimeId
  readonly model: string
  readonly systemPrompt: string
  readonly messages: readonly LocalAgentMessage[]
}

/**
 * Usage reported by a local runtime. There is deliberately no dollar field:
 * subscription usage has no per-call price, and an API-equivalent estimate
 * must never reach budgets.
 */
export interface LocalAgentUsage {
  readonly billing: 'subscription' | 'api' | 'unknown'
  readonly source: 'runtime-reported' | 'estimated'
  /** All input tokens processed: uncached + cache reads + cache writes. */
  readonly inputTokens?: number | undefined
  readonly outputTokens?: number | undefined
  readonly cacheReadTokens?: number | undefined
  readonly cacheWriteTokens?: number | undefined
}

export type LocalAgentErrorCode =
  | 'not-ready'
  | 'signed-out'
  | 'wrong-auth'
  | 'isolation-failed'
  | 'rate-limited'
  | 'runtime-crashed'
  | 'protocol'
  | 'unsupported-input'
  | 'invalid-request'
  | 'unknown'

interface EventBase {
  readonly requestId: string
  /** Strictly increasing per request, starting at 0. */
  readonly seq: number
}

export type LocalAgentEvent =
  | (EventBase & { readonly type: 'text'; readonly text: string })
  | (EventBase & { readonly type: 'completed'; readonly usage?: LocalAgentUsage | undefined })
  | (EventBase & { readonly type: 'cancelled'; readonly usage?: LocalAgentUsage | undefined })
  | (EventBase & {
      readonly type: 'error'
      readonly code: LocalAgentErrorCode
      readonly message: string
      readonly retryable: boolean
      readonly usage?: LocalAgentUsage | undefined
    })

export type LocalAgentTerminalEvent = Exclude<LocalAgentEvent, { readonly type: 'text' }>

/** Exactly one terminal event is sent per request, and nothing after it. */
export function isTerminalEvent(event: LocalAgentEvent): event is LocalAgentTerminalEvent {
  return event.type !== 'text'
}

export type ParseTurnRequestResult =
  | { readonly ok: true; readonly request: LocalAgentTurnRequest }
  | { readonly ok: false; readonly code: 'invalid-request' | 'unsupported-input'; readonly message: string }

const MAX_ID_LENGTH = 128
const MAX_TRANSCRIPT_CHARS = 8_000_000
/** Model IDs and aliases only; never anything that could read as a CLI flag. */
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:\-[\]]{0,127}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH
}

function invalid(message: string): ParseTurnRequestResult {
  return { ok: false, code: 'invalid-request', message }
}

/**
 * Validates an untrusted turn request at the IPC boundary and returns a
 * frozen copy containing only known fields.
 */
export function parseTurnRequest(input: unknown): ParseTurnRequestResult {
  if (!isRecord(input)) return invalid('Request must be an object')
  const { requestId, sessionId, generation, runtime, model, systemPrompt, messages } = input

  if (!isId(requestId)) return invalid('Invalid requestId')
  if (!isId(sessionId)) return invalid('Invalid sessionId')
  if (typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 0) {
    return invalid('Invalid generation')
  }
  if (!RUNTIMES.includes(runtime as LocalAgentRuntimeId)) return invalid('Unknown runtime')
  if (typeof model !== 'string' || !MODEL_PATTERN.test(model)) return invalid('Invalid model')
  if (typeof systemPrompt !== 'string') return invalid('Invalid systemPrompt')
  if (!Array.isArray(messages) || messages.length === 0) return invalid('Messages must be a non-empty array')

  let totalChars = systemPrompt.length
  const parsed: LocalAgentMessage[] = []
  for (const message of messages) {
    if (!isRecord(message)) return invalid('Invalid message')
    if (message['role'] !== 'user' && message['role'] !== 'assistant') return invalid('Invalid message role')
    if (typeof message['content'] !== 'string') return invalid('Invalid message content')
    const attachments = message['attachments']
    if (attachments !== undefined && !(Array.isArray(attachments) && attachments.length === 0)) {
      return { ok: false, code: 'unsupported-input', message: 'Attachments are not supported for subscription advisors yet' }
    }
    totalChars += message['content'].length
    parsed.push(Object.freeze({ role: message['role'], content: message['content'] }))
  }
  if (totalChars > MAX_TRANSCRIPT_CHARS) return invalid('Transcript is too large')

  return {
    ok: true,
    request: Object.freeze({
      requestId,
      sessionId,
      generation,
      runtime: runtime as LocalAgentRuntimeId,
      model,
      systemPrompt,
      messages: Object.freeze(parsed),
    }),
  }
}
