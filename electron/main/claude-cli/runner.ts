import type {
  LocalAgentErrorCode,
  LocalAgentEvent,
  LocalAgentReadiness,
  LocalAgentTerminalEvent,
  LocalAgentTurnRequest,
  LocalAgentUsage,
} from '../../../shared/local-agent/protocol'
import { buildChildEnv, buildTurnArgs, formatTranscript, withRuntimeContextGuard } from './launch'
import { createStreamParser, type StreamParser } from './stream-parser'
import { createRedactor, emailTerms, sensitivePathVariants, type Redactor } from './redactor'
import type { TurnReadiness } from './auth-status'

type Listener<T extends unknown[]> = (...args: T) => void
type TerminalBody = LocalAgentTerminalEvent extends infer E
  ? E extends LocalAgentTerminalEvent ? Omit<E, 'requestId' | 'seq'> : never
  : never

export interface ChildProcessLike {
  readonly pid?: number | undefined
  readonly stdin: { write(chunk: string): unknown; end(): unknown; on(event: 'error', cb: Listener<[Error]>): unknown } | null
  readonly stdout: { setEncoding(encoding: 'utf8'): unknown; on(event: 'data', cb: Listener<[string]>): unknown } | null
  readonly stderr: { on(event: 'data', cb: Listener<[unknown]>): unknown } | null
  on(event: 'error', cb: Listener<[Error]>): unknown
  on(event: 'close', cb: Listener<[number | null]>): unknown
}

export interface SpawnOptions {
  readonly cwd: string
  readonly env: Record<string, string>
  readonly windowsHide: true
  readonly shell: false
}

export interface RunnerDeps {
  readonly command: string
  readonly parentEnv: Readonly<Record<string, string | undefined>>
  spawn(command: string, args: readonly string[], options: SpawnOptions): ChildProcessLike
  killTree(pid: number): void
  makeTempDir(): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  removeDir(path: string): Promise<void>
  joinPath(...parts: string[]): string
  schedule(ms: number, callback: () => void): void
  /** Home directory; repeated paths under it are redacted from advisor output. */
  readonly homeDir: string
  /**
   * Must run the readiness check with exactly `env`, the environment the turn
   * will use. `accountEmail` is only for redaction and never leaves main.
   */
  checkReadiness(env: Record<string, string>): Promise<TurnReadiness>
}

export interface RunningTurn {
  cancel(): void
}

function readinessError(readiness: LocalAgentReadiness): { code: LocalAgentErrorCode; message: string } | null {
  switch (readiness.state) {
    case 'ready':
      return null
    case 'not-installed':
      return { code: 'not-ready', message: 'Claude Code is not installed. Install it and sign in with your Claude account.' }
    case 'signed-out':
      return { code: 'signed-out', message: 'Claude Code is signed out. Run `claude` in a terminal and sign in with your Claude account.' }
    case 'wrong-auth':
      return { code: 'wrong-auth', message: readiness.detail }
    case 'error':
      return { code: 'not-ready', message: readiness.message }
  }
}

/**
 * Runs one advisor turn through the user's own Claude Code install.
 * Guarantees: `seq` increases from 0, exactly one terminal event is emitted,
 * and nothing is emitted after it. `completed` is sent only when the stream
 * reported success AND the process exited with code 0.
 */
export function runTurn(
  request: LocalAgentTurnRequest,
  emit: (event: LocalAgentEvent) => void,
  deps: RunnerDeps,
): RunningTurn {
  let seq = 0
  let finished = false
  let cancelled = false
  let child: ChildProcessLike | null = null
  let tempDir: string | null = null
  let parser: StreamParser | null = null
  let isolationFailure: string | null = null
  let redactor: Redactor = createRedactor({ exact: [], words: [] })
  /** True while a file write or a live child is using the temp dir. */
  let tempDirBusy = false
  let cleaned = false

  // The temp dir holds the persona prompt. It is removed once nothing uses it:
  // removing it under a live child (EBUSY on Windows) or a pending write would leave it behind.
  const cleanup = (): void => {
    if (cleaned || tempDir === null || tempDirBusy) return
    cleaned = true
    void deps.removeDir(tempDir).catch(() => {})
  }

  const finish = (terminal: TerminalBody): void => {
    if (finished) return
    finished = true
    // Release text held back for redaction, but never after an isolation failure.
    const isolated = isolationFailure !== null || (terminal.type === 'error' && terminal.code === 'isolation-failed')
    const tail = isolated ? '' : redactor.flush(terminal.type !== 'completed')
    if (tail !== '') emit({ requestId: request.requestId, seq: seq++, type: 'text', text: tail })
    // Redact before truncating, so a term can't survive by being cut in half.
    const body = terminal.type === 'error' ? { ...terminal, message: truncate(redactor.redact(terminal.message)) } : terminal
    emit({ ...body, requestId: request.requestId, seq: seq++ })
    cleanup()
  }

  const fail = (code: LocalAgentErrorCode, message: string, retryable: boolean, usage?: LocalAgentUsage): void => {
    finish({ type: 'error', code, message, retryable, ...(usage !== undefined ? { usage } : {}) })
  }

  const env = buildChildEnv(deps.parentEnv)

  const start = async (): Promise<void> => {
    const { readiness, accountEmail } = await deps.checkReadiness(env)
    if (finished) return
    const notReady = readinessError(readiness)
    if (notReady !== null) return fail(notReady.code, notReady.message, false)
    // Fail closed: without the account email it can't be kept out of the transcript.
    if (accountEmail === undefined) return fail('not-ready', ACCOUNT_UNREADABLE, false)

    const dir = await deps.makeTempDir()
    if (finished) {
      void deps.removeDir(dir).catch(() => {})
      return
    }
    tempDir = dir
    const identity = emailTerms(accountEmail)
    redactor = createRedactor({
      exact: [...identity.exact, ...sensitivePathVariants(dir), ...sensitivePathVariants(deps.homeDir)],
      words: identity.words,
    })
    const systemPromptFile = deps.joinPath(dir, 'system-prompt.txt')
    tempDirBusy = true
    try {
      await deps.writeFile(systemPromptFile, withRuntimeContextGuard(request.systemPrompt))
    } finally {
      tempDirBusy = false
    }
    if (finished) return cleanup()

    const streamParser = createStreamParser()
    parser = streamParser
    let buffer = ''
    const pushLine = (line: string): void => {
      for (const out of streamParser.push(line)) {
        if (out.kind === 'fatal') {
          // Stop a misconfigured runtime now rather than waiting for it to exit.
          isolationFailure = out.message
          kill()
          deps.schedule(CANCEL_GRACE_MS, () => fail('isolation-failed', out.message, false, streamParser.latestUsage()))
          continue
        }
        if (!finished && !cancelled && isolationFailure === null) {
          const text = redactor.push(out.text)
          if (text !== '') emit({ requestId: request.requestId, seq: seq++, type: 'text', text })
        }
      }
    }

    const proc = deps.spawn(deps.command, buildTurnArgs({ model: request.model, systemPromptFile }), {
      cwd: tempDir,
      env,
      windowsHide: true,
      shell: false,
    })
    child = proc
    tempDirBusy = true

    proc.on('error', () => {
      tempDirBusy = false
      fail('not-ready', 'Claude Code could not be started. Check that it is installed and on your PATH.', false)
      cleanup()
    })

    proc.stdout?.setEncoding('utf8')
    proc.stdout?.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) pushLine(line)
    })
    // stderr can contain local paths; it is drained but never forwarded or logged.
    proc.stderr?.on('data', () => {})

    proc.on('close', (code) => {
      tempDirBusy = false
      if (buffer !== '') pushLine(buffer)
      buffer = ''
      const outcome = streamParser.outcome()
      if (isolationFailure !== null) fail('isolation-failed', isolationFailure, false, outcome.usage)
      else if (cancelled) finish({ type: 'cancelled', ...(outcome.usage !== undefined ? { usage: outcome.usage } : {}) })
      else if (outcome.kind === 'error') fail(outcome.code, outcome.message, outcome.retryable, outcome.usage)
      else if (code !== 0) fail('runtime-crashed', `Claude Code exited unexpectedly (code ${String(code)})`, true, outcome.usage)
      else finish({ type: 'completed', ...(outcome.usage !== undefined ? { usage: outcome.usage } : {}) })
      // A grace-period terminal may already have been sent; the dir is only free now.
      cleanup()
    })

    proc.stdin?.on('error', () => {})
    proc.stdin?.write(formatTranscript(request.messages))
    proc.stdin?.end()
  }

  const kill = (): void => {
    if (child?.pid === undefined) return
    try {
      deps.killTree(child.pid)
    } catch {
      // The process may already have exited.
    }
  }

  start().catch(() => {
    fail('unknown', 'Could not start the Claude Code turn', false)
    kill()
    if (child === null) cleanup()
  })

  return {
    cancel() {
      if (finished || cancelled) return
      cancelled = true
      if (child === null || child.pid === undefined) {
        finish({ type: 'cancelled' })
        return
      }
      kill()
      // The terminal event normally comes from 'close' (with any usage);
      // don't let a process that ignores the kill leave the request open.
      deps.schedule(CANCEL_GRACE_MS, () => {
        const usage = parser?.latestUsage()
        finish({ type: 'cancelled', ...(usage !== undefined ? { usage } : {}) })
      })
    },
  }
}

const CANCEL_GRACE_MS = 5_000
const MAX_MESSAGE_LENGTH = 300
const ACCOUNT_UNREADABLE = 'Could not read the signed-in Claude account, so this turn was blocked to keep account details out of the conversation.'

function truncate(text: string): string {
  if (text.length <= MAX_MESSAGE_LENGTH) return text
  let end = MAX_MESSAGE_LENGTH - 1
  const code = text.charCodeAt(end - 1)
  if (code >= 0xd800 && code <= 0xdbff) end -= 1 // don't leave half a surrogate pair
  return `${text.slice(0, end)}…`
}
