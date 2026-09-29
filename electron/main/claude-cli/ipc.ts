import type { App, IpcMain, IpcMainInvokeEvent, WebContents } from 'electron'
import { join, normalize } from 'path'
import { fileURLToPath } from 'url'
import {
  LOCAL_AGENT_CHANNELS,
  isTerminalEvent,
  parseTurnRequest,
  type LocalAgentEvent,
  type LocalAgentReadiness,
} from '../../../shared/local-agent/protocol'
import { buildChildEnv } from './launch'
import { createRequestRegistry, type RequestRegistry } from './request-registry'
import { runTurn, type RunnerDeps, type RunningTurn } from './runner'

export type StartResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string; readonly message: string }

export interface LocalAgentIpcHandlers {
  readiness(runtime: unknown): Promise<LocalAgentReadiness>
  start(sender: Pick<WebContents, 'id' | 'send' | 'isDestroyed'>, raw: unknown): StartResult
  cancel(senderId: number, requestId: unknown): boolean
  readonly registry: RequestRegistry
}

/** Transport-independent handlers, so the IPC boundary can be unit tested. */
export function createLocalAgentHandlers(deps: RunnerDeps): LocalAgentIpcHandlers {
  const registry = createRequestRegistry()

  return {
    registry,

    readiness(runtime) {
      if (runtime !== 'claude-code') return Promise.resolve({ state: 'error', message: 'Unknown runtime' })
      // Only the readiness state crosses IPC; the account email stays in main.
      return deps.checkReadiness(buildChildEnv(deps.parentEnv)).then((result) => result.readiness)
    },

    start(sender, raw) {
      const parsed = parseTurnRequest(raw)
      if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message }
      const { request } = parsed

      let turn: RunningTurn | null = null
      const owner = { webContentsId: sender.id, sessionId: request.sessionId, generation: request.generation }
      if (!registry.register(request.requestId, owner, () => turn?.cancel())) {
        return { ok: false, code: 'invalid-request', message: 'Duplicate request ID' }
      }

      const forward = (event: LocalAgentEvent): void => {
        if (isTerminalEvent(event)) registry.finish(request.requestId)
        // Events go only to the webContents that started the request.
        if (!sender.isDestroyed()) sender.send(LOCAL_AGENT_CHANNELS.event, event)
      }
      turn = runTurn(request, forward, deps)
      return { ok: true }
    },

    cancel(senderId, requestId) {
      return typeof requestId === 'string' && registry.cancel(requestId, senderId)
    },
  }
}

/**
 * Only Consilium's own top-level page may run turns on the user's plan: the
 * packaged renderer file, or the dev server in development. A page the window
 * was navigated to (e.g. a dropped URL) still gets the preload, so the caller
 * is checked here.
 */
export function isTrustedRendererUrl(
  url: string,
  rendererFilePath: string,
  devServerUrl: string | undefined,
  platform: NodeJS.Platform = process.platform,
): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'file:') {
      // Compare file paths, not URL strings: Chromium and Node encode characters
      // like [ ] ~ differently, and Chromium upper-cases the Windows drive letter.
      if (parsed.host !== '') return false
      const framePath = normalize(fileURLToPath(parsed))
      const expected = normalize(rendererFilePath)
      return platform === 'win32' ? framePath.toLowerCase() === expected.toLowerCase() : framePath === expected
    }
    return devServerUrl !== undefined && devServerUrl !== '' && parsed.origin === new URL(devServerUrl).origin
  } catch {
    return false
  }
}

export function registerLocalAgentIpc(
  ipcMain: IpcMain,
  app: Pick<App, 'on' | 'isPackaged'>,
  deps: RunnerDeps,
): LocalAgentIpcHandlers {
  const handlers = createLocalAgentHandlers(deps)
  const rendererFilePath = join(__dirname, '../renderer/index.html')
  const devServerUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL']
  const trusted = (event: IpcMainInvokeEvent): boolean => {
    const frame = event.senderFrame
    return frame != null && frame.parent === null && isTrustedRendererUrl(frame.url, rendererFilePath, devServerUrl)
  }

  ipcMain.handle(LOCAL_AGENT_CHANNELS.readiness, (event: IpcMainInvokeEvent, runtime: unknown) =>
    trusted(event) ? handlers.readiness(runtime) : Promise.resolve({ state: 'error', message: 'Untrusted caller' }))
  ipcMain.handle(LOCAL_AGENT_CHANNELS.start, (event: IpcMainInvokeEvent, raw: unknown): StartResult =>
    trusted(event) ? handlers.start(event.sender, raw) : { ok: false, code: 'invalid-request', message: 'Untrusted caller' })
  ipcMain.handle(LOCAL_AGENT_CHANNELS.cancel, (event: IpcMainInvokeEvent, requestId: unknown) =>
    trusted(event) && handlers.cancel(event.sender.id, requestId))

  // A reload or a crashed renderer keeps the same webContents but no longer
  // listens; its turns would otherwise keep running on the user's plan.
  app.on('web-contents-created', (_event, contents) => {
    const id = contents.id
    const cancelAll = (): void => handlers.registry.cancelAllFor(id)
    contents.once('destroyed', cancelAll)
    contents.on('render-process-gone', cancelAll)
    contents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) cancelAll()
    })
  })
  app.on('before-quit', () => handlers.registry.cancelAll())

  return handlers
}
