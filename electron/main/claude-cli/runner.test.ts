import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { LocalAgentEvent, LocalAgentReadiness, LocalAgentTurnRequest } from '../../../shared/local-agent/protocol'
import { runTurn, type ChildProcessLike, type RunnerDeps } from './runner'

const request: LocalAgentTurnRequest = {
  requestId: 'r1', sessionId: 's1', generation: 1, runtime: 'claude-code', model: 'claude-opus-5-5',
  systemPrompt: 'You are the Skeptic.', messages: [{ role: 'user', content: '[You]: Ship Friday?' }],
}
const INIT = JSON.stringify({ type: 'system', subtype: 'init', tools: [], mcp_servers: [], apiKeySource: 'none' })
const delta = (text: string): string => JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } })
const RESULT_OK = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, usage: { input_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 7 } })
const READY: LocalAgentReadiness = { state: 'ready', runtimeVersion: '2.1.284', plan: 'max' }

class FakeChild extends EventEmitter implements ChildProcessLike {
  pid: number | undefined = 4242
  stdinText = ''
  stdinEnded = false
  readonly stdout = Object.assign(new EventEmitter(), { setEncoding: () => undefined })
  readonly stderr = new EventEmitter()
  readonly stdin = Object.assign(new EventEmitter(), {
    write: (chunk: string) => { this.stdinText += chunk; return true },
    end: () => { this.stdinEnded = true },
  })
  out(...lines: string[]): void { this.stdout.emit('data', lines.map((l) => `${l}\n`).join('')) }
  exit(code: number | null): void { this.emit('close', code) }
}

/** `accountEmail: null` simulates a status without a usable email. */
function setup(readiness: LocalAgentReadiness = READY, accountEmail: string | null = 'someone@example.com') {
  const child = new FakeChild()
  const events: LocalAgentEvent[] = []
  const scheduled: Array<() => void> = []
  const deps = {
    command: 'claude',
    parentEnv: { PATH: '/bin', ANTHROPIC_API_KEY: 'sk-ant-secret' },
    spawn: vi.fn(() => child),
    killTree: vi.fn(),
    makeTempDir: vi.fn(async () => '/tmp/consilium-abc'),
    writeFile: vi.fn(async () => undefined),
    removeDir: vi.fn(async () => undefined),
    joinPath: (...parts: string[]) => parts.join('/'),
    schedule: vi.fn((_ms: number, cb: () => void) => { scheduled.push(cb) }),
    homeDir: '/home/owner',
    checkReadiness: vi.fn(async () => ({ readiness, accountEmail: accountEmail ?? undefined })),
  } satisfies RunnerDeps
  const turn = runTurn(request, (e) => events.push(e), deps)
  const started = async (): Promise<void> => { await vi.waitFor(() => expect(deps.spawn).toHaveBeenCalled()) }
  return { child, events, deps, turn, started, scheduled }
}

const terminals = (events: readonly LocalAgentEvent[]) => events.filter((e) => e.type !== 'text')

describe('runTurn', () => {
  it('streams text and completes only after a clean exit', async () => {
    const { child, events, started } = setup()
    await started()
    child.out(INIT, delta('Wait'), delta(' for QA.'), RESULT_OK)
    expect(terminals(events)).toEqual([])
    child.exit(0)
    // Redaction may hold back a short tail, so chunk boundaries can move; the text and ordering can't.
    const texts = events.filter((e) => e.type === 'text').map((e) => (e as { text: string }).text)
    expect(texts.join('')).toBe('Wait for QA.')
    expect(events.at(-1)).toMatchObject({ type: 'completed', usage: { billing: 'subscription', inputTokens: 5, outputTokens: 7 } })
    expect(events.map((e) => e.seq)).toEqual(events.map((_e, i) => i))
  })

  it('reports a crash when a successful result is followed by a non-zero exit', async () => {
    const { child, events, started } = setup()
    await started()
    child.out(INIT, delta('ok'), RESULT_OK)
    child.exit(1)
    expect(terminals(events)).toEqual([
      expect.objectContaining({ type: 'error', code: 'runtime-crashed', retryable: true, usage: expect.objectContaining({ outputTokens: 7 }) }),
    ])
  })

  it('handles output split across chunks and a final line without a newline', async () => {
    const { child, events, started } = setup()
    await started()
    const all = [INIT, delta('split'), RESULT_OK].join('\n')
    child.stdout.emit('data', all.slice(0, 30))
    child.stdout.emit('data', all.slice(30))
    child.exit(0)
    expect(events.map((e) => e.type)).toEqual(['text', 'completed'])
  })

  it('launches without the API key in the environment, in the temp dir, with the transcript on stdin', async () => {
    const { child, deps, started } = setup()
    await started()
    const [command, args, options] = deps.spawn.mock.calls[0] as unknown as [string, string[], { cwd: string; env: Record<string, string>; shell: boolean }]
    expect(command).toBe('claude')
    expect(options.cwd).toBe('/tmp/consilium-abc')
    expect(options.shell).toBe(false)
    expect(options.env).toEqual({ PATH: '/bin', CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' })
    expect(deps.checkReadiness).toHaveBeenCalledWith({ PATH: '/bin', CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' })
    expect(args.join(' ')).not.toContain('Skeptic')
    expect(deps.writeFile).toHaveBeenCalledWith('/tmp/consilium-abc/system-prompt.txt', expect.stringMatching(/^You are the Skeptic\.\n\nYour runtime adds context/))
    expect(child.stdinText).toContain('[You]: Ship Friday?')
    expect(child.stdinEnded).toBe(true)
  })

  it.each([
    [{ state: 'signed-out' } as const, 'signed-out'],
    [{ state: 'wrong-auth', detail: 'API key' } as const, 'wrong-auth'],
    [{ state: 'not-installed' } as const, 'not-ready'],
    [{ state: 'error', message: 'bad' } as const, 'not-ready'],
  ])('fails closed without spawning when readiness is %o', async (readiness, code) => {
    const { events, deps } = setup(readiness)
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(deps.spawn).not.toHaveBeenCalled()
    expect(events[0]).toMatchObject({ type: 'error', code, seq: 0 })
  })

  it('cancels a running turn: kills the tree, emits one cancelled event, then nothing', async () => {
    const { child, events, deps, turn, started, scheduled } = setup()
    await started()
    child.out(INIT, delta('partial'))
    turn.cancel()
    expect(deps.killTree).toHaveBeenCalledWith(4242)
    child.out(delta('late'))
    child.exit(null)
    scheduled.forEach((cb) => cb())
    expect(events.map((e) => e.type)).toEqual(['text', 'cancelled'])
  })

  it('still terminates if the killed process never closes', async () => {
    const { events, turn, started, scheduled } = setup()
    await started()
    turn.cancel()
    expect(events).toEqual([])
    scheduled.forEach((cb) => cb())
    expect(events).toEqual([expect.objectContaining({ type: 'cancelled' })])
  })

  it('cancels before spawning without starting the process', async () => {
    const { events, deps, turn } = setup()
    turn.cancel()
    expect(events).toEqual([expect.objectContaining({ type: 'cancelled', seq: 0 })])
    await new Promise((r) => setTimeout(r, 0))
    expect(deps.spawn).not.toHaveBeenCalled()
  })

  it('reports a spawn failure once even if close follows', async () => {
    const { child, events, started } = setup()
    await started()
    child.emit('error', Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }))
    child.exit(-2)
    expect(terminals(events)).toEqual([expect.objectContaining({ type: 'error', code: 'not-ready' })])
  })

  it('kills the process as soon as init fails isolation, before close, and forwards nothing after', async () => {
    const { child, events, deps, started, scheduled } = setup()
    await started()
    child.out(JSON.stringify({ type: 'system', subtype: 'init', tools: ['Bash'], mcp_servers: [], apiKeySource: 'none' }))
    expect(deps.killTree).toHaveBeenCalledWith(4242)
    child.out(delta('should not appear'))
    expect(events).toEqual([])
    child.exit(null)
    scheduled.forEach((cb) => cb())
    expect(events).toEqual([expect.objectContaining({ type: 'error', code: 'isolation-failed', seq: 0 })])
  })

  it('terminates an isolation failure even if the killed process never closes', async () => {
    const { child, events, started, scheduled } = setup()
    await started()
    child.out(JSON.stringify({ type: 'system', subtype: 'init', tools: [], mcp_servers: [], apiKeySource: 'ANTHROPIC_API_KEY' }))
    scheduled.forEach((cb) => cb())
    expect(events).toEqual([expect.objectContaining({ type: 'error', code: 'isolation-failed' })])
  })

  it('keeps usage already reported when a cancelled process never closes', async () => {
    const { child, events, turn, started, scheduled } = setup()
    await started()
    child.out(INIT, delta('done'), RESULT_OK)
    turn.cancel()
    scheduled.forEach((cb) => cb())
    expect(events.at(-1)).toMatchObject({ type: 'cancelled', usage: { outputTokens: 7 } })
  })

  it('does not remove the temp directory under a live child after a grace-period terminal', async () => {
    const { child, deps, turn, started, scheduled } = setup()
    await started()
    turn.cancel()
    scheduled.forEach((cb) => cb())
    expect(deps.removeDir).not.toHaveBeenCalled()
    child.exit(null)
    expect(deps.removeDir).toHaveBeenCalledWith('/tmp/consilium-abc')
  })

  it('removes the temp directory after finishing', async () => {
    const { child, deps, started } = setup()
    await started()
    child.out(INIT, RESULT_OK)
    child.exit(0)
    expect(deps.removeDir).toHaveBeenCalledWith('/tmp/consilium-abc')
  })
})

describe('runTurn redaction', () => {
  const textOf = (events: readonly LocalAgentEvent[]) =>
    events.filter((e) => e.type === 'text').map((e) => (e as { text: string }).text).join('')

  it('removes the account email, temp dir and home dir from streamed text, even across chunks', async () => {
    const { child, events, started } = setup()
    await started()
    child.out(INIT, delta('You are someone@exa'), delta('mple.com, running in /tmp/consilium-abc'), delta(' under /home/owner/x.'), RESULT_OK)
    child.exit(0)
    expect(textOf(events)).toBe('You are [redacted], running in [redacted] under [redacted]/x.')
    expect(events.at(-1)?.type).toBe('completed')
    expect(events.map((e) => e.seq)).toEqual(events.map((_e, i) => i))
  })

  it('redacts error messages too', async () => {
    const { child, events, started } = setup()
    await started()
    child.out(INIT, JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Failed for someone@example.com' }))
    child.exit(1)
    expect(events.at(-1)).toMatchObject({ type: 'error', message: 'Failed for [redacted]' })
  })

  it('does not release held-back text after an isolation failure', async () => {
    const { child, events, started, scheduled } = setup()
    await started()
    child.out(INIT, delta('partial answer'))
    child.out(JSON.stringify({ type: 'system', subtype: 'init', tools: ['Bash'], mcp_servers: [], apiKeySource: 'none' }))
    child.exit(null)
    scheduled.forEach((cb) => cb())
    expect(textOf(events)).not.toContain('answer')
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'isolation-failed' })
  })
})

describe('runTurn redaction: fail-closed and every terminal path', () => {
  const textOf = (events: readonly LocalAgentEvent[]) =>
    events.filter((e) => e.type === 'text').map((e) => (e as { text: string }).text).join('')

  it('blocks the turn without spawning when the account email is unavailable', async () => {
    const { events, deps } = setup(READY, null)
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(deps.spawn).not.toHaveBeenCalled()
    expect(events[0]).toMatchObject({ type: 'error', code: 'not-ready' })
  })

  it('redacts before truncating, so a term crossing the length limit does not leak', async () => {
    const { child, events, started } = setup()
    await started()
    child.out(INIT, JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: `${'x'.repeat(290)} someone@example.com tail` }))
    child.exit(1)
    const message = (events.at(-1) as { message: string }).message
    expect(message.length).toBeLessThanOrEqual(300)
    expect(message).not.toMatch(/some/)
  })

  it('redacts the fallback whole-message text', async () => {
    const { child, events, started } = setup()
    await started()
    child.out(INIT, JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Mail someone@example.com today' }] } }), RESULT_OK)
    child.exit(0)
    expect(textOf(events)).toBe('Mail [redacted] today')
  })

  it.each([
    ['a crash', (c: FakeChild) => { c.out(INIT, delta('Reach someone@exa')); c.exit(1) }],
    ['a runtime error', (c: FakeChild) => { c.out(INIT, delta('Reach someone@exa'), JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'boom' })); c.exit(1) }],
  ])('does not release a partial email held at the end of a stream cut off by %s', async (_label, run) => {
    const { child, events, started } = setup()
    await started()
    run(child)
    expect(textOf(events)).toBe('Reach [redacted]')
  })

  it('does not release a partial email when a cancelled turn closes', async () => {
    const { child, events, turn, started } = setup()
    await started()
    child.out(INIT, delta('Reach someone@exa'))
    turn.cancel()
    child.exit(null)
    expect(textOf(events)).toBe('Reach [redacted]')
    expect(events.at(-1)?.type).toBe('cancelled')
  })

  it('on a normally completed reply, removes only whole-word and exact matches', async () => {
    const { child, events, started } = setup()
    await started()
    child.out(INIT, delta('We should ask someone'), RESULT_OK)
    child.exit(0)
    // "someone" alone is the name part of someone@example.com, a whole-word term, so it is still redacted;
    // what matters is that nothing beyond whole-word matches is removed.
    expect(textOf(events)).toBe('We should ask [redacted]')
  })

  it('releases no held text when a cancel follows an isolation failure, and reports the isolation failure', async () => {
    const { child, events, turn, started, scheduled } = setup()
    await started()
    child.out(INIT, delta('partial answer'))
    child.out(JSON.stringify({ type: 'system', subtype: 'init', tools: ['Bash'], mcp_servers: [], apiKeySource: 'none' }))
    turn.cancel()
    child.exit(null)
    scheduled.forEach((cb) => cb())
    expect(textOf(events)).toBe('')
    expect(events.filter((e) => e.type !== 'text')).toEqual([expect.objectContaining({ type: 'error', code: 'isolation-failed' })])
  })
})

describe('runTurn error truncation', () => {
  it('never leaves half an emoji at the truncation point', async () => {
    const { child, events, started } = setup()
    await started()
    child.out(INIT, JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: `${'x'.repeat(298)}🙂🙂` }))
    child.exit(1)
    const message = (events.at(-1) as { message: string }).message
    const beforeEllipsis = message.charCodeAt(message.length - 2)
    expect(beforeEllipsis >= 0xd800 && beforeEllipsis <= 0xdbff).toBe(false)
    expect(message.length).toBeLessThanOrEqual(300)
  })
})
