import { app, BrowserWindow, ipcMain, shell, dialog, Menu } from 'electron'
import { join, resolve, normalize, sep, basename, extname } from 'path'
import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, unlinkSync, existsSync } from 'fs'
import { loadEnvFile, writeEnvFile } from './env-loader'
import { loadAdapterDefinitions, saveAdapterDefinition, deleteAdapterDefinition, isValidAdapterDef } from './adapter-store'

// ── App Configuration ─────────────────────────────────────────

interface CustomProviderDef {
  readonly id: string
  readonly name: string
  readonly baseUrl: string
  readonly modelListEndpoint: string | null
  readonly healthCheckEndpoint: string | null
  readonly costEndpoint: string | null
}

interface AppConfig {
  readonly maxSessionSizeMB: number
  readonly autoSaveDebounceMs: number
  readonly defaultTurnMode: string
  readonly maxFileAttachmentMB: number
  readonly customProviders: readonly CustomProviderDef[]
}

/** Description for each config key — shown in the Edit Configuration modal */
export const CONFIG_DESCRIPTIONS: Readonly<Record<string, string>> = {
  maxSessionSizeMB: 'Maximum session file size in megabytes before save is rejected.',
  autoSaveDebounceMs: 'Delay in milliseconds before auto-saving after a change. Lower = more frequent saves.',
  defaultTurnMode: 'Default turn mode for new sessions: sequential, parallel, manual, or queue.',
  maxFileAttachmentMB: 'Maximum file size in megabytes for attachments.',
}

const DEFAULT_CONFIG: AppConfig = {
  maxSessionSizeMB: 100,
  autoSaveDebounceMs: 2000,
  defaultTurnMode: 'sequential',
  maxFileAttachmentMB: 10,
  customProviders: [],
}

function loadAppConfig(): AppConfig {
  const configPath = join(app.getPath('userData'), 'config.json')
  try {
    const content = readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(content) as Record<string, unknown>
    return {
      maxSessionSizeMB: typeof parsed['maxSessionSizeMB'] === 'number' ? parsed['maxSessionSizeMB'] : DEFAULT_CONFIG.maxSessionSizeMB,
      autoSaveDebounceMs: typeof parsed['autoSaveDebounceMs'] === 'number' ? parsed['autoSaveDebounceMs'] : DEFAULT_CONFIG.autoSaveDebounceMs,
      defaultTurnMode: typeof parsed['defaultTurnMode'] === 'string' ? parsed['defaultTurnMode'] : DEFAULT_CONFIG.defaultTurnMode,
      maxFileAttachmentMB: typeof parsed['maxFileAttachmentMB'] === 'number' ? parsed['maxFileAttachmentMB'] : DEFAULT_CONFIG.maxFileAttachmentMB,
      customProviders: parseCustomProviders(parsed['customProviders']),
    }
  } catch {
    try {
      mkdirSync(app.getPath('userData'), { recursive: true })
      writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8')
    } catch { /* non-fatal */ }
    return DEFAULT_CONFIG
  }
}

function parseCustomProviders(raw: unknown): readonly CustomProviderDef[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((entry): entry is CustomProviderDef => {
    if (entry == null || typeof entry !== 'object') return false
    const e = entry as Record<string, unknown>
    return typeof e['id'] === 'string' && e['id'] !== ''
      && typeof e['name'] === 'string' && e['name'] !== ''
      && typeof e['baseUrl'] === 'string' && e['baseUrl'] !== ''
  }).map((e) => ({
    id: e.id,
    name: e.name,
    baseUrl: e.baseUrl,
    modelListEndpoint: typeof e.modelListEndpoint === 'string' ? e.modelListEndpoint : null,
    healthCheckEndpoint: typeof e.healthCheckEndpoint === 'string' ? e.healthCheckEndpoint : null,
    costEndpoint: typeof e.costEndpoint === 'string' ? e.costEndpoint : null,
  }))
}

function saveAppConfig(config: AppConfig): void {
  const configPath = join(app.getPath('userData'), 'config.json')
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

let appConfig = DEFAULT_CONFIG

// ── Menu & Context Menu ──────────────────────────────────────

const IS_DEV = !app.isPackaged

function createAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Consilium',
          accelerator: 'CmdOrCtrl+N',
          click: () => { mainWindow?.webContents.send('menu:new-consilium') },
        },
        { type: 'separator' },
        {
          label: 'Save Session',
          accelerator: 'CmdOrCtrl+S',
          click: () => { mainWindow?.webContents.send('menu:save-session') },
        },
        {
          label: 'Set Budget',
          click: () => { mainWindow?.webContents.send('menu:set-budget') },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Edit Configuration',
          click: () => { mainWindow?.webContents.send('menu:edit-config') },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        ...(IS_DEV ? [
          { type: 'separator' as const },
          { role: 'reload' as const },
          { role: 'toggleDevTools' as const },
        ] : []),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Consilium',
          click: () => { mainWindow?.webContents.send('menu:about') },
        },
        { type: 'separator' },
        {
          label: 'Documentation',
          click: () => { shell.openExternal('https://github.com/FpSilSha/Consilium/wiki') },
        },
        {
          label: 'Report Issue',
          click: () => { shell.openExternal('https://github.com/FpSilSha/Consilium/issues/new') },
        },
        { type: 'separator' },
        {
          label: 'GitHub',
          click: () => { shell.openExternal('https://github.com/FpSilSha/Consilium') },
        },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  // Always register the menu for keyboard accelerators (Ctrl+N, Ctrl+S, etc.)
  Menu.setApplicationMenu(menu)

  // On Windows/Linux, hide the native menu bar since we use a custom title bar
  if (process.platform !== 'darwin') {
    mainWindow?.setMenuBarVisibility(false)
    mainWindow?.setAutoHideMenuBar(true)
  }
}

function setupContextMenu(): void {
  if (mainWindow == null) return
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menu = Menu.buildFromTemplate([
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll' },
    ])
    menu.popup()
  })
}

import { loadEncryptedKeys, saveEncryptedKey, deleteEncryptedKey, isEncryptionAvailable, isValidProviderId } from './key-store'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: isMac, // macOS keeps native frame for traffic lights; Windows/Linux frameless
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL'] !== undefined) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function isPathWithinAllowed(targetPath: string, allowedRoots: readonly string[]): boolean {
  const normalized = normalize(resolve(targetPath))
  return allowedRoots.some((root) => {
    const normalizedRoot = normalize(resolve(root))
    return normalized === normalizedRoot || normalized.startsWith(normalizedRoot + sep)
  })
}

function validateEnvEntries(entries: unknown): Record<string, string> | null {
  if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) {
    return null
  }

  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(entries as Record<string, unknown>)) {
    // Skip prototype pollution keys
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue
    }
    if (typeof key !== 'string' || typeof value !== 'string') {
      return null
    }
    // Validate key format: alphanumeric and underscores only
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      return null
    }
    result[key] = value
  }

  return result
}

function registerIpcHandlers(): void {
  ipcMain.handle('get-user-data-path', () => app.getPath('userData'))

  // ── Window controls ────────────────────────────────────────
  ipcMain.handle('window:minimize', () => { mainWindow?.minimize() })
  ipcMain.handle('window:maximize', () => {
    if (mainWindow == null) return
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })
  ipcMain.handle('window:close', () => { mainWindow?.close() })
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)

  ipcMain.handle('shell:open-external', (_event, url: unknown) => {
    if (typeof url !== 'string') throw new Error('Invalid URL')
    // Only allow http/https URLs to prevent file:// or other protocol abuse
    if (!url.startsWith('https://') && !url.startsWith('http://')) throw new Error('Only http(s) URLs allowed')
    return shell.openExternal(url)
  })

  ipcMain.handle('read-env-file', () => loadEnvFile())

  ipcMain.handle('write-env-file', async (_event, entries: unknown) => {
    const validated = validateEnvEntries(entries)
    if (validated === null) {
      throw new Error('Invalid entries format: expected Record<string, string> with valid env key names')
    }
    writeEnvFile(validated)
  })

  ipcMain.handle('keys:available', () => isEncryptionAvailable())

  ipcMain.handle('keys:load', () => loadEncryptedKeys())

  ipcMain.handle('keys:save', async (_event, providerId: unknown, rawKey: unknown, metadata: unknown) => {
    if (typeof providerId !== 'string' || typeof rawKey !== 'string') {
      throw new Error('Invalid arguments: expected (string, string)')
    }
    if (!isValidProviderId(providerId)) {
      throw new Error('Invalid provider ID format')
    }
    if (rawKey.length === 0 || rawKey.length > 512) {
      throw new Error('Invalid key length')
    }
    // Validate optional metadata
    let validatedMetadata: { provider?: string; baseUrl?: string } | undefined
    if (metadata != null && typeof metadata === 'object' && !Array.isArray(metadata)) {
      const m = metadata as Record<string, unknown>
      validatedMetadata = {
        ...(typeof m['provider'] === 'string' ? { provider: m['provider'] } : {}),
        ...(typeof m['baseUrl'] === 'string' ? { baseUrl: m['baseUrl'] } : {}),
      }
    }
    saveEncryptedKey(providerId, rawKey, validatedMetadata)
  })

  ipcMain.handle('keys:delete', async (_event, providerId: unknown) => {
    if (typeof providerId !== 'string') {
      throw new Error('Invalid argument: expected string')
    }
    if (!isValidProviderId(providerId)) {
      throw new Error('Invalid provider ID format')
    }
    deleteEncryptedKey(providerId)
  })

  ipcMain.handle('catalog-prefs:load', () => {
    const filePath = join(app.getPath('userData'), 'catalog-preferences.json')
    try {
      const content = readFileSync(filePath, 'utf-8')
      return JSON.parse(content) as unknown
    } catch {
      return null // File doesn't exist yet — caller uses defaults
    }
  })

  ipcMain.handle('catalog-prefs:save', (_event, data: unknown) => {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new Error('Invalid catalog preferences format')
    }
    const serialized = JSON.stringify(data, null, 2)
    if (serialized.length > 512_000) {
      throw new Error('Catalog preferences payload exceeds 512KB limit')
    }
    const dirPath = app.getPath('userData')
    mkdirSync(dirPath, { recursive: true })
    const filePath = join(dirPath, 'catalog-preferences.json')
    writeFileSync(filePath, serialized, 'utf-8')
  })

  ipcMain.handle('dialog:save-file', async (_event, defaultName: unknown, content: unknown, filters: unknown) => {
    if (mainWindow == null) return false
    if (typeof defaultName !== 'string' || typeof content !== 'string') return false

    const dialogFilters = Array.isArray(filters)
      ? filters.filter((f): f is { name: string; extensions: string[] } =>
          typeof f === 'object' && f != null && typeof f.name === 'string' && Array.isArray(f.extensions),
        )
      : [{ name: 'Markdown', extensions: ['md'] }, { name: 'All Files', extensions: ['*'] }]

    const safeName = basename(defaultName)
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: safeName,
      filters: dialogFilters,
    })

    if (result.canceled || result.filePath == null) return false

    writeFileSync(result.filePath, content, 'utf-8')
    return true
  })

  // ── App config ─────────────────────────────────────────────

  ipcMain.handle('config:load', () => ({
    values: appConfig,
    descriptions: CONFIG_DESCRIPTIONS,
  }))

  ipcMain.handle('config:save', (_event, newConfig: unknown) => {
    if (typeof newConfig !== 'object' || newConfig === null || Array.isArray(newConfig)) {
      throw new Error('Invalid config format')
    }
    const raw = newConfig as Record<string, unknown>
    const validated: AppConfig = {
      maxSessionSizeMB: typeof raw['maxSessionSizeMB'] === 'number' ? raw['maxSessionSizeMB'] : appConfig.maxSessionSizeMB,
      autoSaveDebounceMs: typeof raw['autoSaveDebounceMs'] === 'number' ? raw['autoSaveDebounceMs'] : appConfig.autoSaveDebounceMs,
      defaultTurnMode: typeof raw['defaultTurnMode'] === 'string' ? raw['defaultTurnMode'] : appConfig.defaultTurnMode,
      maxFileAttachmentMB: typeof raw['maxFileAttachmentMB'] === 'number' ? raw['maxFileAttachmentMB'] : appConfig.maxFileAttachmentMB,
      customProviders: parseCustomProviders(raw['customProviders'] ?? appConfig.customProviders),
    }
    appConfig = validated
    saveAppConfig(validated)
  })

  // ── Custom adapter definitions ─────────────────────────────

  ipcMain.handle('adapters:load', () => loadAdapterDefinitions())

  ipcMain.handle('adapters:save', (_event, def: unknown) => {
    if (!isValidAdapterDef(def)) throw new Error('Invalid adapter definition: must include id, name, request, response, createdAt, updatedAt')
    saveAdapterDefinition(def)
  })

  ipcMain.handle('adapters:delete', (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('Invalid adapter ID')
    deleteAdapterDefinition(id)
  })

  // ── Session persistence ────────────────────────────────────

  const sessionsDir = join(app.getPath('userData'), 'sessions')

  ipcMain.handle('session:save', (_event, id: unknown, content: unknown) => {
    if (typeof id !== 'string' || typeof content !== 'string') throw new Error('Invalid args')
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid session ID')
    const maxBytes = appConfig.maxSessionSizeMB * 1024 * 1024
    if (content.length > maxBytes) throw new Error(`Session payload exceeds ${appConfig.maxSessionSizeMB}MB limit (configurable in config.json)`)
    mkdirSync(sessionsDir, { recursive: true })
    writeFileSync(join(sessionsDir, `${id}.council`), content, 'utf-8')
  })

  ipcMain.handle('session:load', (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('Invalid arg')
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid session ID')
    const filePath = join(sessionsDir, `${id}.council`)
    if (!existsSync(filePath)) return null
    return readFileSync(filePath, 'utf-8')
  })

  ipcMain.handle('session:list', () => {
    if (!existsSync(sessionsDir)) return []
    const files = readdirSync(sessionsDir).filter((f) => f.endsWith('.council'))
    return files.map((f) => {
      const id = f.replace('.council', '')
      try {
        const content = readFileSync(join(sessionsDir, f), 'utf-8')
        const parsed = JSON.parse(content) as { name?: string; updatedAt?: number }
        return {
          id,
          name: typeof parsed.name === 'string' ? parsed.name : id,
          updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
        }
      } catch {
        return { id, name: id, updatedAt: 0 }
      }
    }).sort((a, b) => b.updatedAt - a.updatedAt)
  })

  ipcMain.handle('session:delete', (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('Invalid arg')
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid session ID')
    const filePath = join(sessionsDir, `${id}.council`)
    if (existsSync(filePath)) unlinkSync(filePath)
  })

  ipcMain.handle('dialog:open-file', async (_event, filters: unknown) => {
    if (mainWindow == null) return []

    const dialogFilters = Array.isArray(filters)
      ? filters.filter((f): f is { name: string; extensions: string[] } =>
          typeof f === 'object' && f != null && typeof f.name === 'string' && Array.isArray(f.extensions),
        )
      : [
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
          { name: 'Text', extensions: ['txt', 'md', 'json', 'csv', 'xml', 'html', 'css', 'js', 'ts', 'py'] },
          { name: 'All Files', extensions: ['*'] },
        ]

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: dialogFilters,
    })

    if (result.canceled || result.filePaths.length === 0) return []

    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
    const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'])
    const MIME_MAP: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml', '.txt': 'text/plain', '.md': 'text/markdown',
      '.json': 'application/json', '.csv': 'text/csv', '.xml': 'text/xml',
      '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
      '.ts': 'text/typescript', '.py': 'text/x-python',
    }

    const files: { name: string; mimeType: string; data: string; sizeBytes: number }[] = []

    for (const filePath of result.filePaths) {
      try {
        const stat = statSync(filePath)
        if (stat.size > MAX_FILE_SIZE) continue // skip oversized files

        const ext = extname(filePath).toLowerCase()
        const mimeType = MIME_MAP[ext] ?? 'application/octet-stream'
        const name = basename(filePath)
        const isImage = IMAGE_EXTS.has(ext)

        const content = readFileSync(filePath)
        const data = isImage ? content.toString('base64') : content.toString('utf-8')

        files.push({ name, mimeType, data, sizeBytes: stat.size })
      } catch {
        // Skip unreadable files
      }
    }

    return files
  })

  ipcMain.handle('open-folder', async (_event, path: unknown) => {
    if (typeof path !== 'string') {
      throw new Error('Invalid path: expected string')
    }

    const allowedRoots = [
      app.getPath('userData'),
      join(app.getAppPath(), 'personas'),
      join(app.getAppPath(), 'themes'),
    ]

    if (!isPathWithinAllowed(path, allowedRoots)) {
      throw new Error('Path is outside allowed directories')
    }

    const errorMessage = await shell.openPath(path)
    if (errorMessage !== '') {
      throw new Error(`Failed to open folder: ${errorMessage}`)
    }
  })
}

app.whenReady().then(() => {
  appConfig = loadAppConfig()
  createAppMenu()
  registerIpcHandlers()
  createWindow()
  setupContextMenu()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      setupContextMenu()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
