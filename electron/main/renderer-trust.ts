import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { normalize } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

/**
 * Where Consilium's own renderer is served from. The main window may show only
 * this page, and only this page may call the main-process IPC handlers: a page
 * the window is navigated to (e.g. a dropped URL) would still get the preload,
 * and with it every exposed API, including decrypted keys.
 */
export interface RendererLocation {
  /** The built renderer/index.html that loadFile() shows. */
  readonly rendererFilePath: string
  /** electron-vite's dev server (ELECTRON_RENDERER_URL); never set when packaged. */
  readonly devServerUrl: string | undefined
}

export function resolveRendererLocation(
  rendererFilePath: string,
  isPackaged: boolean,
  env: Readonly<Record<string, string | undefined>>,
): RendererLocation {
  return { rendererFilePath, devServerUrl: isPackaged ? undefined : env['ELECTRON_RENDERER_URL'] }
}

/**
 * Windows paths compare case-insensitively. Only ASCII is folded: Chromium only
 * changes the drive letter's case, and JavaScript's full case folding merges
 * letters NTFS keeps distinct (U+212A KELVIN SIGN lower-cases to 'k').
 */
const foldAsciiCase = (path: string): string => path.replace(/[A-Z]+/g, (letters) => letters.toLowerCase())

/**
 * Only Consilium's own top-level page may call main: the packaged renderer
 * file (any hash or query), or the dev server's origin in development.
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
      // A copy run from a share (\\server\share) is file://server/share/...
      // Hosts are compared in the parser's ASCII form, which is what Chromium
      // uses; outside Windows fileURLToPath rejects any host anyway. A share
      // on \\localhost is not supported: the parser drops that host.
      const expectedUrl = pathToFileURL(rendererFilePath)
      if (parsed.host !== expectedUrl.host) return false
      // Chromium reports a local file only as file:///C:/... The parser also
      // reads file://localhost/C:/ and C%3A as that file, but Chromium keeps a
      // "localhost" not spelled exactly so as a server name, and reads C%3A
      // as no drive, so it would load some other path.
      if (platform === 'win32' && parsed.host === '' && !/^file:\/\/\/[a-z]:(\/|$)/i.test(url)) return false
      // Compare file paths, not URL strings: Chromium and Node encode characters
      // like [ ] ~ differently, and Chromium upper-cases the Windows drive letter.
      // Chromium also keeps a '%' that starts no escape (a folder named "100%"),
      // which fileURLToPath would reject.
      const pathname = parsed.pathname.replace(/%(?![0-9a-f]{2})/gi, '%25')
      const framePath = normalize(fileURLToPath(`file://${parsed.host}${pathname}`))
      const expected = normalize(fileURLToPath(expectedUrl))
      return platform === 'win32' ? foldAsciiCase(framePath) === foldAsciiCase(expected) : framePath === expected
    }
    if (devServerUrl === undefined || devServerUrl === '') return false
    const dev = new URL(devServerUrl)
    // An opaque origin ('null') must never match, e.g. a data: page; and the
    // scheme must match too, since a blob: URL reports its creator's origin.
    return (dev.protocol === 'http:' || dev.protocol === 'https:')
      && parsed.protocol === dev.protocol
      && parsed.origin === dev.origin
  } catch {
    return false
  }
}

/** The WebFrameMain fields the sender check reads. */
export interface SenderFrameLike {
  readonly url: string
  readonly parent: unknown
}

/**
 * An IPC sender is trusted only as the top-level frame of the app's own page.
 * A null frame (navigated away or destroyed since sending) is not trusted, nor
 * is a disposed one, whose getters throw.
 */
export function isTrustedSenderFrame(
  frame: SenderFrameLike | null | undefined,
  location: RendererLocation,
  platform: NodeJS.Platform = process.platform,
): boolean {
  try {
    return frame != null
      && frame.parent === null
      && isTrustedRendererUrl(frame.url, location.rendererFilePath, location.devServerUrl, platform)
  } catch {
    return false
  }
}

type InvokeListener = Parameters<IpcMain['handle']>[1]
type SyncListener = Parameters<IpcMain['on']>[1]

/**
 * ipcMain registration that runs a handler only for the app's own renderer.
 * Handlers keep their signatures and behaviour; an untrusted invoke rejects.
 */
export function createTrustedIpc(
  ipcMain: Pick<IpcMain, 'handle' | 'on'>,
  location: RendererLocation,
  platform: NodeJS.Platform = process.platform,
) {
  const trusted = (event: IpcMainEvent | IpcMainInvokeEvent): boolean => {
    try {
      return isTrustedSenderFrame(event.senderFrame, location, platform)
    } catch {
      return false
    }
  }

  return {
    handle(channel: string, listener: InvokeListener): void {
      ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        if (!trusted(event)) throw new Error(`Untrusted sender for ${channel}`)
        return listener(event, ...args)
      })
    },

    /** For sendSync channels: an untrusted sender gets `rejectedValue` back instead of hanging. */
    handleSync(channel: string, listener: SyncListener, rejectedValue: unknown): void {
      ipcMain.on(channel, (event: IpcMainEvent, ...args: unknown[]) => {
        if (!trusted(event)) {
          event.returnValue = rejectedValue
          return
        }
        listener(event, ...args)
      })
    },
  }
}

/** The link to hand to the system browser, or null for anything but http(s). */
export function externalBrowserUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

/** The WebContents members the navigation guard uses. */
export interface NavigableContents {
  on(event: 'will-navigate', listener: (details: { readonly url: string; preventDefault(): void }) => void): unknown
  setWindowOpenHandler(handler: (details: { readonly url: string }) => { action: 'deny' }): void
}

/**
 * Keeps a window on the app's own page. Other navigations (links, dropped URLs
 * or files, scripts) are blocked. New windows are never created, since they
 * would inherit the preload; http(s) links open in the system browser instead,
 * as shell:open-external does.
 */
export function guardRendererNavigation(
  contents: NavigableContents,
  location: RendererLocation,
  openExternal: (url: string) => Promise<void>,
  platform: NodeJS.Platform = process.platform,
): void {
  contents.on('will-navigate', (details) => {
    if (!isTrustedRendererUrl(details.url, location.rendererFilePath, location.devServerUrl, platform)) {
      details.preventDefault()
    }
  })

  contents.setWindowOpenHandler(({ url }) => {
    const external = externalBrowserUrl(url)
    if (external !== null) openExternal(external).catch(() => { /* no browser; nothing to report to */ })
    return { action: 'deny' }
  })
}
