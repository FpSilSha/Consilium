import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { IpcMainInvokeEvent } from 'electron'
import {
  createTrustedIpc,
  externalBrowserUrl,
  guardRendererNavigation,
  isTrustedRendererUrl,
  isTrustedSenderFrame,
  resolveRendererLocation,
  type NavigableContents,
  type RendererLocation,
} from './renderer-trust'

describe('isTrustedRendererUrl', () => {
  const rendererPath = join(tmpdir(), 'Apps [old]', 'CONSIL~1', 'dist', 'renderer', 'index.html')
  const encodedUrl = pathToFileURL(rendererPath).href
  // Chromium's canonical form keeps [ ] ~ literal where Node percent-encodes them.
  const chromiumUrl = encodedUrl.replace(/%5B/gi, '[').replace(/%5D/gi, ']').replace(/%7E/gi, '~')

  it('trusts the packaged renderer file however the URL is encoded, ignoring hash and query', () => {
    expect(isTrustedRendererUrl(encodedUrl, rendererPath, undefined)).toBe(true)
    expect(isTrustedRendererUrl(chromiumUrl, rendererPath, undefined)).toBe(true)
    expect(isTrustedRendererUrl(`${chromiumUrl}#/chat`, rendererPath, undefined)).toBe(true)
    expect(isTrustedRendererUrl(`${chromiumUrl}?x=1`, rendererPath, undefined)).toBe(true)
  })

  it.runIf(process.platform === 'win32')('ignores drive-letter case on Windows', () => {
    const lowerDrive = rendererPath.replace(/^([A-Z]):/, (_m, d: string) => `${d.toLowerCase()}:`)
    expect(isTrustedRendererUrl(pathToFileURL(rendererPath).href, lowerDrive, undefined)).toBe(true)
  })

  it('rejects the path on another host, other local files, and remote pages', () => {
    expect(isTrustedRendererUrl(`file://otherhost${new URL(encodedUrl).pathname}`, rendererPath, undefined)).toBe(false)
    expect(isTrustedRendererUrl(pathToFileURL(join(tmpdir(), 'evil.html')).href, rendererPath, undefined)).toBe(false)
    expect(isTrustedRendererUrl('https://example.com/', rendererPath, undefined)).toBe(false)
    expect(isTrustedRendererUrl('not a url', rendererPath, undefined)).toBe(false)
  })

  it('trusts the dev server origin only when one is configured', () => {
    expect(isTrustedRendererUrl('http://localhost:5173/#/x', rendererPath, 'http://localhost:5173')).toBe(true)
    expect(isTrustedRendererUrl('http://localhost:5174/', rendererPath, 'http://localhost:5173')).toBe(false)
    expect(isTrustedRendererUrl('http://localhost:5173/', rendererPath, undefined)).toBe(false)
  })

  it('treats path case as significant outside Windows', () => {
    const shouted = encodedUrl.replace('/renderer/', '/RENDERER/')
    expect(isTrustedRendererUrl(shouted, rendererPath, undefined, 'linux')).toBe(false)
  })

  it.runIf(process.platform === 'win32')('ignores ASCII path case on Windows', () => {
    const shouted = encodedUrl.replace('/renderer/', '/RENDERER/')
    expect(isTrustedRendererUrl(shouted, rendererPath, undefined, 'win32')).toBe(true)
  })

  it('rejects sibling files, the renderer directory, and about:blank', () => {
    expect(isTrustedRendererUrl(encodedUrl.replace('index.html', 'other.html'), rendererPath, undefined)).toBe(false)
    expect(isTrustedRendererUrl(encodedUrl.replace('index.html', ''), rendererPath, undefined)).toBe(false)
    expect(isTrustedRendererUrl('about:blank', rendererPath, undefined)).toBe(false)
  })

  it('still trusts the packaged file while a dev server is configured', () => {
    expect(isTrustedRendererUrl(encodedUrl, rendererPath, 'http://localhost:5174')).toBe(true)
  })

  it('never matches through an empty or non-http dev server URL', () => {
    expect(isTrustedRendererUrl('http://localhost:5173/', rendererPath, '')).toBe(false)
    // Both have the opaque origin 'null'.
    expect(isTrustedRendererUrl('data:text/html,<p>x</p>', rendererPath, 'data:text/html,y')).toBe(false)
    expect(isTrustedRendererUrl('about:blank', rendererPath, 'about:blank')).toBe(false)
  })

  it('requires the dev server scheme, so https: and blob: URLs of its host do not match', () => {
    expect(isTrustedRendererUrl('https://localhost:5173/', rendererPath, 'http://localhost:5173')).toBe(false)
    // A blob: URL reports its creator's origin; only the scheme check stops it.
    expect(new URL('blob:http://localhost:5173/0f0f').origin).toBe('http://localhost:5173')
    expect(isTrustedRendererUrl('blob:http://localhost:5173/0f0f', rendererPath, 'http://localhost:5173')).toBe(false)
  })

  it.runIf(process.platform === 'win32')('folds only ASCII case on Windows, not letters NTFS keeps distinct', () => {
    const real = join(tmpdir(), 'Mark', 'dist', 'renderer', 'index.html')
    // U+212A KELVIN SIGN lower-cases to 'k' in JavaScript but is its own name on NTFS.
    const kelvin = pathToFileURL(real).href.replace('/Mark/', '/Mar%E2%84%AA/')
    expect(isTrustedRendererUrl(kelvin, real, undefined, 'win32')).toBe(false)
    expect(isTrustedRendererUrl(pathToFileURL(real).href.replace('/Mark/', '/MARK/'), real, undefined, 'win32')).toBe(true)
  })

  describe.runIf(process.platform === 'win32')('UNC install (network share)', () => {
    const unc = '\\\\Server\\share\\Consilium\\dist\\renderer\\index.html'

    it('trusts the renderer on the share it was loaded from', () => {
      expect(isTrustedRendererUrl('file://server/share/Consilium/dist/renderer/index.html#/', unc, undefined)).toBe(true)
      expect(isTrustedRendererUrl(pathToFileURL(unc).href, unc, undefined)).toBe(true)
    })

    it('does not trust the same path on another host, or a UNC alias of a local install', () => {
      expect(isTrustedRendererUrl('file://other/share/Consilium/dist/renderer/index.html', unc, undefined)).toBe(false)
      const local = 'C:\\Consilium\\dist\\renderer\\index.html'
      expect(isTrustedRendererUrl('file://127.0.0.1/C$/Consilium/dist/renderer/index.html', local, undefined)).toBe(false)
      expect(isTrustedRendererUrl('file://server/C:/Consilium/dist/renderer/index.html', local, undefined)).toBe(false)
    })

    it('matches server names the URL parser rewrites (non-ASCII, IPv4 shorthand)', () => {
      // The parser turns SÉRVER into xn--srver-bsa and 127.1 into 127.0.0.1.
      const accented = '\\\\SÉRVER\\share\\Consilium\\dist\\renderer\\index.html'
      expect(isTrustedRendererUrl('file://xn--srver-bsa/share/Consilium/dist/renderer/index.html', accented, undefined)).toBe(true)
      const shorthand = '\\\\127.1\\share\\Consilium\\dist\\renderer\\index.html'
      expect(isTrustedRendererUrl('file://127.0.0.1/share/Consilium/dist/renderer/index.html', shorthand, undefined)).toBe(true)
    })
  })

  describe.runIf(process.platform === 'win32')('local file spellings that Chromium reads differently from Node', () => {
    // Chromium reports a local file only as file:///C:/... Node drops any
    // "localhost" host and decodes C%3A to a drive, but Chromium keeps
    // "localhost" as a server name unless it is spelled exactly so, and reads
    // C%3A as no drive: it would load some other, nonexistent path.
    const local = 'C:\\Consilium\\dist\\renderer\\index.html'

    it('trusts only the canonical file:///C:/ form', () => {
      expect(isTrustedRendererUrl('file:///C:/Consilium/dist/renderer/index.html', local, undefined)).toBe(true)
      expect(isTrustedRendererUrl('file:///c:/Consilium/dist/renderer/index.html', local, undefined)).toBe(true)
    })

    it('does not trust a localhost host in any spelling', () => {
      for (const host of ['localhost', 'LOCALHOST', 'l%6Fcalhost']) {
        expect(isTrustedRendererUrl(`file://${host}/C:/Consilium/dist/renderer/index.html`, local, undefined)).toBe(false)
      }
    })

    it('does not trust a drive letter spelled with an escape or a pipe', () => {
      expect(isTrustedRendererUrl('file://localhost/C%3A/Consilium/dist/renderer/index.html', local, undefined)).toBe(false)
      expect(isTrustedRendererUrl('file:///C%3A/Consilium/dist/renderer/index.html', local, undefined)).toBe(false)
      expect(isTrustedRendererUrl('file:///%43:/Consilium/dist/renderer/index.html', local, undefined)).toBe(false)
      expect(isTrustedRendererUrl('file:///c|/Consilium/dist/renderer/index.html', local, undefined)).toBe(false)
    })
  })

  describe.runIf(process.platform === 'win32')('Windows install path with spaces and odd characters', () => {
    // The default per-user NSIS location, under a user name with a space, an
    // apostrophe and a '%'. Chromium reports the URL loadFile() built, in its own
    // canonical form: drive letter upper-cased, spaces escaped, and the '%'
    // that starts no escape left as is.
    const installed = "c:\\Users\\Pat O'Neil 100%\\AppData\\Local\\Programs\\Consilium App\\resources\\app.asar\\dist\\renderer\\index.html"
    const chromium = "file:///C:/Users/Pat%20O'Neil%20100%/AppData/Local/Programs/Consilium%20App/resources/app.asar/dist/renderer/index.html"

    it('trusts the Chromium form of the renderer URL', () => {
      expect(isTrustedRendererUrl(`${chromium}#/`, installed, undefined)).toBe(true)
    })

    it('trusts the Node form too', () => {
      expect(isTrustedRendererUrl(pathToFileURL(installed).href, installed, undefined)).toBe(true)
    })

    it('does not trust a neighbouring folder whose name differs only after the %', () => {
      const neighbour = chromium.replace('100%/', '100%25x/')
      expect(isTrustedRendererUrl(neighbour, installed, undefined)).toBe(false)
    })
  })
})

describe('resolveRendererLocation', () => {
  const file = join(tmpdir(), 'dist', 'renderer', 'index.html')

  it('uses only the built file when packaged, even if the env names a dev server', () => {
    expect(resolveRendererLocation(file, true, { ELECTRON_RENDERER_URL: 'http://localhost:5174' }))
      .toEqual({ rendererFilePath: file, devServerUrl: undefined })
  })

  it('adds the dev server when unpackaged', () => {
    expect(resolveRendererLocation(file, false, { ELECTRON_RENDERER_URL: 'http://localhost:5174' }).devServerUrl)
      .toBe('http://localhost:5174')
    expect(resolveRendererLocation(file, false, {}).devServerUrl).toBeUndefined()
  })
})

const rendererFilePath = join(tmpdir(), 'Consilium App', 'dist', 'renderer', 'index.html')
const appUrl = pathToFileURL(rendererFilePath).href
const location: RendererLocation = { rendererFilePath, devServerUrl: undefined }

describe('isTrustedSenderFrame', () => {
  it('trusts only the top-level frame showing the app renderer', () => {
    expect(isTrustedSenderFrame({ url: appUrl, parent: null }, location)).toBe(true)
    expect(isTrustedSenderFrame({ url: appUrl, parent: { url: appUrl } }, location)).toBe(false)
    expect(isTrustedSenderFrame({ url: 'https://example.com/', parent: null }, location)).toBe(false)
  })

  it('rejects a missing frame (navigated away or destroyed)', () => {
    expect(isTrustedSenderFrame(null, location)).toBe(false)
    expect(isTrustedSenderFrame(undefined, location)).toBe(false)
  })

  it('rejects a disposed frame, whose getters throw, instead of throwing', () => {
    const disposed = { get url(): string { throw new Error('Render frame was disposed') }, parent: null }
    expect(isTrustedSenderFrame(disposed, location)).toBe(false)
  })
})

describe('createTrustedIpc', () => {
  type Listener = (event: unknown, ...args: unknown[]) => unknown

  function setup() {
    const invoke = new Map<string, Listener>()
    const sync = new Map<string, Listener>()
    const ipcMain = {
      handle: (channel: string, listener: Listener) => { invoke.set(channel, listener) },
      on: (channel: string, listener: Listener) => { sync.set(channel, listener) },
    }
    return {
      ipc: createTrustedIpc(ipcMain as never, location),
      invoke,
      sync,
      trustedEvent: { senderFrame: { url: `${appUrl}#/`, parent: null } },
      untrustedEvent: { senderFrame: { url: 'https://example.com/', parent: null } },
    }
  }

  it('passes trusted invokes through with the same arguments and result', async () => {
    const { ipc, invoke, trustedEvent } = setup()
    const handler = vi.fn((_event: IpcMainInvokeEvent, a: unknown, b: unknown) => Promise.resolve([a, b]))
    ipc.handle('keys:save', handler)

    await expect(invoke.get('keys:save')?.(trustedEvent, 'openai', 'sk-test')).resolves.toEqual(['openai', 'sk-test'])
    expect(handler).toHaveBeenCalledWith(trustedEvent, 'openai', 'sk-test')
  })

  it('keeps handler errors unchanged for trusted senders', () => {
    const { ipc, invoke, trustedEvent } = setup()
    ipc.handle('session:load', () => { throw new Error('Invalid session ID') })
    expect(() => invoke.get('session:load')?.(trustedEvent, '../x')).toThrow('Invalid session ID')
  })

  it('rejects untrusted invokes without running the handler', () => {
    const { ipc, invoke, untrustedEvent } = setup()
    const handler = vi.fn(() => [{ providerId: 'openai', key: 'secret' }])
    ipc.handle('keys:load', handler)

    expect(() => invoke.get('keys:load')?.(untrustedEvent)).toThrow('Untrusted sender for keys:load')
    expect(handler).not.toHaveBeenCalled()
  })

  it('rejects a subframe or a missing frame even on the app URL', () => {
    const { ipc, invoke } = setup()
    const handler = vi.fn()
    ipc.handle('keys:load', handler)

    expect(() => invoke.get('keys:load')?.({ senderFrame: { url: appUrl, parent: {} } })).toThrow('Untrusted sender')
    expect(() => invoke.get('keys:load')?.({ senderFrame: null })).toThrow('Untrusted sender')
    expect(handler).not.toHaveBeenCalled()
  })

  it('answers untrusted sendSync calls with the rejected value without running the handler', () => {
    const { ipc, sync, trustedEvent, untrustedEvent } = setup()
    const handler = vi.fn((event: { returnValue: unknown }) => { event.returnValue = true })
    ipc.handleSync('session:save-sync', handler as never, false)

    const rejected = { ...untrustedEvent, returnValue: undefined as unknown }
    sync.get('session:save-sync')?.(rejected, 'id', '{}')
    expect(rejected.returnValue).toBe(false)
    expect(handler).not.toHaveBeenCalled()

    const accepted = { ...trustedEvent, returnValue: undefined as unknown }
    sync.get('session:save-sync')?.(accepted, 'id', '{}')
    expect(accepted.returnValue).toBe(true)
    expect(handler).toHaveBeenCalledWith(accepted, 'id', '{}')
  })

  it('treats an event whose senderFrame getter throws as untrusted', () => {
    const { ipc, invoke, sync } = setup()
    const handler = vi.fn()
    ipc.handle('keys:load', handler)
    ipc.handleSync('session:save-sync', handler, false)
    const throwing = () => ({ get senderFrame(): never { throw new Error('boom') }, returnValue: undefined as unknown })

    expect(() => invoke.get('keys:load')?.(throwing())).toThrow('Untrusted sender for keys:load')
    const event = throwing()
    expect(() => sync.get('session:save-sync')?.(event, 'id', '{}')).not.toThrow()
    expect(event.returnValue).toBe(false)
    expect(handler).not.toHaveBeenCalled()
  })

  it('answers a sendSync from a disposed frame with the rejected value', () => {
    const { ipc, sync } = setup()
    const handler = vi.fn()
    ipc.handleSync('session:save-sync', handler, false)

    const disposed = { senderFrame: { get url(): string { throw new Error('disposed') }, parent: null }, returnValue: undefined as unknown }
    expect(() => sync.get('session:save-sync')?.(disposed, 'id', '{}')).not.toThrow()
    expect(disposed.returnValue).toBe(false)
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('externalBrowserUrl', () => {
  it('returns http(s) links, normalized', () => {
    expect(externalBrowserUrl('https://example.com/a b')).toBe('https://example.com/a%20b')
    expect(externalBrowserUrl('HTTP://Example.com')).toBe('http://example.com/')
  })

  it('refuses everything else', () => {
    for (const url of ['file:///C:/Windows/System32/calc.exe', 'javascript:alert(1)', 'about:blank', 'mailto:a@b.c', 'ms-settings:', 'not a url', '']) {
      expect(externalBrowserUrl(url)).toBeNull()
    }
  })
})

describe('guardRendererNavigation', () => {
  function setup(devServerUrl?: string) {
    let willNavigate: ((details: { url: string; preventDefault(): void }) => void) | undefined
    let windowOpen: ((details: { url: string }) => { action: string }) | undefined
    const contents: NavigableContents = {
      on: (_event, listener) => { willNavigate = listener },
      setWindowOpenHandler: (handler) => { windowOpen = handler },
    }
    const openExternal = vi.fn((_url: string) => Promise.resolve())
    guardRendererNavigation(contents, { rendererFilePath, devServerUrl }, openExternal)

    /** True when the navigation was allowed to proceed. */
    const navigate = (url: string): boolean => {
      const preventDefault = vi.fn()
      willNavigate?.({ url, preventDefault })
      return preventDefault.mock.calls.length === 0
    }
    return { navigate, open: (url: string) => windowOpen?.({ url }), openExternal }
  }

  it('lets the window move within the app renderer', () => {
    const { navigate } = setup()
    expect(navigate(`${appUrl}#/settings`)).toBe(true)
  })

  it('lets the dev server page reload itself in development', () => {
    const { navigate } = setup('http://localhost:5174')
    expect(navigate('http://localhost:5174/')).toBe(true)
  })

  it('blocks navigating to remote pages, other local files and other ports, without opening a browser', () => {
    const { navigate, openExternal } = setup('http://localhost:5174')
    expect(navigate('https://example.com/')).toBe(false)
    expect(navigate(pathToFileURL(join(tmpdir(), 'Downloads', 'evil.html')).href)).toBe(false)
    expect(navigate('http://localhost:5175/')).toBe(false)
    expect(navigate('javascript:alert(1)')).toBe(false)
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('never opens a new window, sending http(s) links to the system browser', () => {
    const { open, openExternal } = setup()
    expect(open('https://example.com/docs')).toEqual({ action: 'deny' })
    expect(openExternal).toHaveBeenCalledWith('https://example.com/docs')
  })

  it('denies other window targets outright, including the app itself', () => {
    const { open, openExternal } = setup()
    for (const url of [appUrl, pathToFileURL(join(tmpdir(), 'evil.html')).href, 'about:blank', 'javascript:alert(1)']) {
      expect(open(url)).toEqual({ action: 'deny' })
    }
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('swallows a failed external open', async () => {
    const { open, openExternal } = setup()
    openExternal.mockImplementationOnce(() => Promise.reject(new Error('no browser')))
    expect(open('https://example.com/')).toEqual({ action: 'deny' })
    // An unhandled rejection here would fail the run.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})

describe('electron/main/index.ts registrations', () => {
  // Regression guard: every channel must go through the sender check.
  const source = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf-8')

  it('registers no IPC handler directly on ipcMain', () => {
    // Passing ipcMain to a registrar (createTrustedIpc) is fine; touching its
    // members or aliasing it here would bypass the sender check.
    expect(source).not.toMatch(/\bipcMain\s*(\?\.|\.|\[)/)
    expect(source).not.toMatch(/=\s*ipcMain\b/)
    expect(source).not.toMatch(/\bipcMain\s+as\b/)
    expect(source).not.toMatch(/\(\s*ipcMain\s*\)/)
  })

  it('registers no handler on a per-window IPC channel either', () => {
    // webContents.ipc / webFrameMain.ipc skip ipcMain, and with it the check.
    expect(source).not.toMatch(/\.ipc\s*(\?\.|\.)\s*(handle|handleOnce|on|once|addListener|prependListener|prependOnceListener)\b/)
  })

  it('guards the main window before loading the renderer', () => {
    const guard = source.indexOf('guardRendererNavigation(mainWindow.webContents')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(source.indexOf('mainWindow.loadURL('))
    expect(guard).toBeLessThan(source.indexOf('mainWindow.loadFile('))
  })
})
