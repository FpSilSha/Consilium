import type {
  LocalAgentEvent,
  LocalAgentMessage,
  LocalAgentTurnRequest,
  LocalAgentUsage,
} from '../../../../shared/local-agent/protocol'
import type { ApiMessage, ApiRequestConfig, TokenUsage } from '../types'
import type { StreamCallbacks } from '../stream-orchestrator'

/** The preload bridge methods this client needs (see electron/preload). */
export interface LocalAgentBridge {
  localAgentStart(request: LocalAgentTurnRequest): Promise<{ ok: true } | { ok: false; code: string; message: string }>
  localAgentCancel(requestId: string): Promise<boolean>
  onLocalAgentEvent(callback: (event: LocalAgentEvent) => void): () => void
}

export interface SessionSnapshot {
  readonly sessionId: string | null
  readonly generation: number
}

export interface LocalAgentClientDeps {
  readonly bridge: LocalAgentBridge | null
  captureSession(): SessionSnapshot
  newRequestId(): string
}

const ABORTED = 'Cancelled'
const ATTACHMENTS_UNSUPPORTED =
  'This conversation includes file attachments, which Claude subscription advisors cannot read yet. Use an API-key advisor for this conversation.'

function toLocalMessage(message: ApiMessage): LocalAgentMessage {
  return { role: message.role, content: message.content }
}

function toTokenUsage(usage: LocalAgentUsage | undefined): TokenUsage | undefined {
  if (usage?.inputTokens === undefined || usage.outputTokens === undefined) return undefined
  return { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
}

/**
 * Streams one turn from the user's local Claude Code runtime through the
 * Electron bridge, with the same callback contract as `streamResponse`.
 *
 * Every callback is gated on the session generation captured at start. The
 * generation advances only when another conversation is loaded or a new one
 * is started, so a stale turn is cancelled in main and reported through
 * `onStale` (no store writes) instead of `onDone`/`onError`. The session ID
 * is not compared: saving an unsaved conversation assigns one mid-turn
 * without changing the conversation.
 *
 * Every call settles exactly once. Aborting cancels the child process and then
 * reports `onError` with the signal already aborted: votes and exchanges settle
 * their promises from a callback, and every caller checks `signal.aborted`
 * before writing to the store.
 */
export function streamLocalAgent(
  config: ApiRequestConfig,
  callbacks: StreamCallbacks,
  deps: LocalAgentClientDeps,
): AbortController {
  const controller = new AbortController()
  if (config.signal !== undefined) {
    if (config.signal.aborted) controller.abort(config.signal.reason)
    else config.signal.addEventListener('abort', () => controller.abort(config.signal!.reason), { once: true })
  }

  const started = deps.captureSession()
  const isCurrent = (): boolean => deps.captureSession().generation === started.generation

  /** Fails before anything reaches main; still async, like a network error. */
  const failEarly = (message: string): AbortController => {
    queueMicrotask(() => {
      if (controller.signal.aborted) callbacks.onError(ABORTED)
      else if (!isCurrent()) callbacks.onStale?.()
      else callbacks.onError(message)
    })
    return controller
  }

  const { bridge } = deps
  if (bridge === null) return failEarly('Claude subscription advisors need the Consilium desktop app')
  // v1 contract: attachments are rejected, not silently converted or dropped.
  if (config.messages.some((m) => (m.attachments?.length ?? 0) > 0)) return failEarly(ATTACHMENTS_UNSUPPORTED)
  if (controller.signal.aborted) return failEarly(ABORTED)

  const requestId = deps.newRequestId()
  let fullContent = ''
  let lastSeq = -1
  let done = false
  let unsubscribe: () => void = () => {}

  const stop = (): void => {
    if (done) return
    done = true
    unsubscribe()
  }

  const cancelRemote = (): void => {
    void bridge.localAgentCancel(requestId).catch(() => {})
  }

  /** Runs a terminal callback once, unless the turn was aborted or went stale. */
  const settle = (deliver: () => void): void => {
    if (done) return
    stop()
    if (controller.signal.aborted) return
    if (!isCurrent()) {
      cancelRemote()
      callbacks.onStale?.()
      return
    }
    deliver()
  }

  unsubscribe = bridge.onLocalAgentEvent((event) => {
    if (done || event.requestId !== requestId || event.seq <= lastSeq) return
    lastSeq = event.seq
    if (!isCurrent()) {
      settle(() => {})
      return
    }
    switch (event.type) {
      case 'text':
        fullContent += event.text
        callbacks.onChunk(event.text)
        return
      case 'completed':
        settle(() => callbacks.onDone(fullContent, toTokenUsage(event.usage)))
        return
      case 'cancelled':
        settle(() => callbacks.onError('The Claude Code turn was cancelled', toTokenUsage(event.usage)))
        return
      case 'error':
        settle(() => callbacks.onError(event.message, toTokenUsage(event.usage)))
    }
  })

  controller.signal.addEventListener('abort', () => {
    if (done) return
    stop()
    cancelRemote()
    queueMicrotask(() => callbacks.onError(ABORTED))
  }, { once: true })

  const request: LocalAgentTurnRequest = {
    requestId,
    sessionId: started.sessionId ?? 'unsaved',
    generation: started.generation,
    runtime: 'claude-code',
    model: config.model,
    systemPrompt: config.systemPrompt,
    messages: config.messages.map(toLocalMessage),
  }

  bridge.localAgentStart(request).then(
    (result) => {
      if (!result.ok) settle(() => callbacks.onError(result.message))
    },
    () => settle(() => callbacks.onError('Could not reach the Claude Code runtime')),
  )

  return controller
}
