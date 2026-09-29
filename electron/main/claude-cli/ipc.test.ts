import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { LOCAL_AGENT_CHANNELS } from '../../../shared/local-agent/protocol'
import { createLocalAgentHandlers, registerLocalAgentIpc } from './ipc'
import type { ChildProcessLike, RunnerDeps } from './runner'

vi.mock('electron', () => ({}))

const validRequest = (requestId = 'r1') => ({
  requestId, sessionId: 's1', generation: 1, runtime: 'claude-code', model: 'claude-opus-5-5',
  systemPrompt: 'sys', messages: [{ role: 'user', content: '[You]: hi' }],
})

class FakeChild extends EventEmitter implements ChildProcessLike {
  pid = 1
  readonly stdout = Object.assign(new EventEmitter(), { setEncoding: () => undefined })
  readonly stderr = new EventEmitter()
  readonly stdin = Object.assign(new EventEmitter(), { write: () => true, end: () => undefined })
}

function setup() {
  const children: FakeChild[] = []
  const deps: RunnerDeps = {
    command: 'claude',
    parentEnv: { PATH: '/bin', ANTHROPIC_API_KEY: 'sk' },
    spawn: vi.fn(() => { const c = new FakeChild(); children.push(c); return c }),
    killTree: vi.fn(),
    makeTempDir: async () => '/tmp/x',
    writeFile: async () => undefined,
    removeDir: async () => undefined,
    joinPath: (...p) => p.join('/'),
    schedule: () => undefined,
    homeDir: '/home/u',
    checkReadiness: vi.fn(async () => ({ readiness: { state: 'ready', runtimeVersion: '2.1.284' } as const, accountEmail: 'someone@example.com' })),
  }
  const sender = (id: number) => ({ id, send: vi.fn(), isDestroyed: () => false })
  return { handlers: createLocalAgentHandlers(deps), deps, children, sender }
}

describe('local-agent IPC handlers', () => {
  it('rejects malformed requests at the boundary without spawning', () => {
    const { handlers, deps, sender } = setup()
    expect(handlers.start(sender(1), { ...validRequest(), model: '--bare' })).toMatchObject({ ok: false, code: 'invalid-request' })
    expect(deps.spawn).not.toHaveBeenCalled()
  })

  it('rejects a duplicate in-flight request ID', () => {
    const { handlers, sender } = setup()
    expect(handlers.start(sender(1), validRequest())).toEqual({ ok: true })
    expect(handlers.start(sender(1), validRequest())).toMatchObject({ ok: false })
  })

  it('sends events only to the webContents that started the request', async () => {
    const { handlers, children, sender } = setup()
    const owner = sender(1)
    const other = sender(2)
    handlers.start(owner, validRequest())
    await vi.waitFor(() => expect(children).toHaveLength(1))
    children[0]!.emit('close', 0)
    expect(owner.send).toHaveBeenCalledWith(LOCAL_AGENT_CHANNELS.event, expect.objectContaining({ requestId: 'r1', type: 'error' }))
    expect(other.send).not.toHaveBeenCalled()
  })

  it('refuses cancellation from a different webContents', async () => {
    const { handlers, deps, children, sender } = setup()
    handlers.start(sender(1), validRequest())
    await vi.waitFor(() => expect(children).toHaveLength(1))
    expect(handlers.cancel(2, 'r1')).toBe(false)
    expect(deps.killTree).not.toHaveBeenCalled()
    expect(handlers.cancel(1, 'r1')).toBe(true)
    expect(deps.killTree).toHaveBeenCalledTimes(1)
  })

  it('frees the request ID after the terminal event', async () => {
    const { handlers, children, sender } = setup()
    handlers.start(sender(1), validRequest())
    await vi.waitFor(() => expect(children).toHaveLength(1))
    children[0]!.emit('close', 0)
    expect(handlers.registry.ownerOf('r1')).toBeUndefined()
    expect(handlers.cancel(1, 'r1')).toBe(false)
  })

  it('checks readiness with the API key removed and rejects unknown runtimes', async () => {
    const { handlers, deps } = setup()
    await handlers.readiness('claude-code')
    expect(deps.checkReadiness).toHaveBeenCalledWith({ PATH: '/bin', CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' })
    expect(await handlers.readiness('other')).toMatchObject({ state: 'error' })
  })

  it('ignores a non-string cancel ID', () => {
    const { handlers } = setup()
    expect(handlers.cancel(1, { requestId: 'r1' })).toBe(false)
  })
})

describe('readiness over IPC', () => {
  it('never includes the account email', async () => {
    const { handlers } = setup()
    const readiness = await handlers.readiness('claude-code')
    expect(readiness).toEqual({ state: 'ready', runtimeVersion: '2.1.284' })
    expect(JSON.stringify(readiness)).not.toContain('example.com')
  })
})

describe('registerLocalAgentIpc', () => {
  it('registers the three channels through the trusted wrapper and cancels on renderer loss and quit', async () => {
    const { deps } = setup()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    const ipc = { handle: (channel: string, listener: (...args: unknown[]) => unknown) => { registered.set(channel, listener) } }
    const appEvents: string[] = []
    const app = { on: (name: string) => { appEvents.push(name); return app } }
    registerLocalAgentIpc(ipc as never, app as never, deps)
    expect([...registered.keys()].sort()).toEqual([LOCAL_AGENT_CHANNELS.cancel, LOCAL_AGENT_CHANNELS.readiness, LOCAL_AGENT_CHANNELS.start].sort())
    expect(appEvents.sort()).toEqual(['before-quit', 'web-contents-created'])
    const readiness = await registered.get(LOCAL_AGENT_CHANNELS.readiness)!({}, 'claude-code')
    expect(readiness).toEqual({ state: 'ready', runtimeVersion: '2.1.284' })
  })
})
