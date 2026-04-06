import { app, BrowserWindow, ipcMain, shell, dialog, Menu } from 'electron'

// CDP debugging: uncomment and restart to enable external debugging
// app.commandLine.appendSwitch('remote-debugging-port', '9333')
import { join, resolve, normalize, sep, basename, extname } from 'path'
import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, unlinkSync, existsSync, renameSync } from 'fs'
// env-loader removed — keys use safeStorage exclusively
import { loadAdapterDefinitions, saveAdapterDefinition, deleteAdapterDefinition, isValidAdapterDef } from './adapter-store'
import { loadCustomProviders, saveCustomProviders, isValidProvider, type CustomProviderDef } from './custom-providers-store'
import { loadCustomModels, saveCustomModels, addCustomModelId } from './custom-models-store'

// ── App Configuration ─────────────────────────────────────────

interface AppConfig {
  readonly maxSessionSizeMB: number
  readonly autoSaveDebounceMs: number
  readonly defaultTurnMode: string
  readonly maxFileAttachmentMB: number
  readonly showOnboarding: boolean
}

/** Description for each config key — shown in the Edit Configuration modal */
export const CONFIG_DESCRIPTIONS: Readonly<Record<string, string>> = {
  maxSessionSizeMB: 'Maximum session file size in megabytes before save is rejected.',
  autoSaveDebounceMs: 'Delay in milliseconds before auto-saving after a change. Lower = more frequent saves.',
  defaultTurnMode: 'Default turn mode for new sessions: sequential, parallel, manual, or queue.',
  maxFileAttachmentMB: 'Maximum file size in megabytes for attachments.',
  showOnboarding: 'Show the onboarding wizard on next startup. Automatically set to false after completing the wizard.',
}

const DEFAULT_CONFIG: AppConfig = {
  maxSessionSizeMB: 100,
  autoSaveDebounceMs: 2000,
  defaultTurnMode: 'sequential',
  maxFileAttachmentMB: 10,
  showOnboarding: true,
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
      showOnboarding: typeof parsed['showOnboarding'] === 'boolean' ? parsed['showOnboarding'] : DEFAULT_CONFIG.showOnboarding,
    }
  } catch {
    try {
      mkdirSync(app.getPath('userData'), { recursive: true })
      writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8')
    } catch { /* non-fatal */ }
    return DEFAULT_CONFIG
  }
}

function saveAppConfig(config: AppConfig): void {
  const configPath = join(app.getPath('userData'), 'config.json')
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

let appConfig = DEFAULT_CONFIG

/**
 * One-time migration: moves customProviders from config.json to custom-providers.json
 * and customModels from catalog-preferences.json to custom-models.json.
 */
function migrateCustomData(): void {
  const userData = app.getPath('userData')

  // Migrate customProviders from config.json → custom-providers.json
  try {
    const configPath = join(userData, 'config.json')
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, 'utf-8')
      const parsed = JSON.parse(content) as Record<string, unknown>
      if (Array.isArray(parsed['customProviders']) && parsed['customProviders'].length > 0) {
        const existing = loadCustomProviders()
        if (existing.length === 0) {
          const toMigrate = (parsed['customProviders'] as unknown[]).filter(isValidProvider)
          if (toMigrate.length > 0) saveCustomProviders(toMigrate)
        }
        const { customProviders: _, ...rest } = parsed
        writeFileSync(configPath, JSON.stringify(rest, null, 2), 'utf-8')
      }
    }
  } catch {
    // If save fails, config.json retains the data — no loss
  }

  // Migrate customModels from catalog-preferences.json → custom-models.json
  try {
    const prefsPath = join(userData, 'catalog-preferences.json')
    if (existsSync(prefsPath)) {
      const content = readFileSync(prefsPath, 'utf-8')
      const parsed = JSON.parse(content) as Record<string, unknown>
      if (parsed['customModels'] != null && typeof parsed['customModels'] === 'object' && !Array.isArray(parsed['customModels'])) {
        const customModels = parsed['customModels'] as Record<string, readonly string[]>
        const hasEntries = Object.values(customModels).some((arr) => Array.isArray(arr) && arr.length > 0)
        if (hasEntries) {
          const existing = loadCustomModels()
          if (Object.keys(existing).length === 0) {
            saveCustomModels(customModels)
          }
          const { customModels: _, ...rest } = parsed
          writeFileSync(prefsPath, JSON.stringify(rest, null, 2), 'utf-8')
        }
      }
    }
  } catch {
    // If save fails, catalog-preferences.json retains the data — no loss
  }
}

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
  ipcMain.handle('window:toggle-devtools', () => { mainWindow?.webContents.toggleDevTools() })

  ipcMain.handle('shell:open-external', (_event, url: unknown) => {
    if (typeof url !== 'string') throw new Error('Invalid URL')
    // Only allow http/https URLs to prevent file:// or other protocol abuse
    if (!url.startsWith('https://') && !url.startsWith('http://')) throw new Error('Only http(s) URLs allowed')
    return shell.openExternal(url)
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
      showOnboarding: typeof raw['showOnboarding'] === 'boolean' ? raw['showOnboarding'] : appConfig.showOnboarding,
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

  // ── Custom providers ───────────────────────────────────────

  ipcMain.handle('custom-providers:load', () => loadCustomProviders())

  ipcMain.handle('custom-providers:save', (_event, providers: unknown) => {
    if (!Array.isArray(providers)) throw new Error('Invalid providers format')
    const validated = providers.filter(isValidProvider)
    saveCustomProviders(validated)
  })

  // ── Custom models ─────────────────────────────────────────

  ipcMain.handle('custom-models:load', () => loadCustomModels())

  ipcMain.handle('custom-models:save', (_event, models: unknown) => {
    if (typeof models !== 'object' || models === null || Array.isArray(models)) throw new Error('Invalid models format')
    // Validate each entry is a string array
    const validated: Record<string, readonly string[]> = {}
    for (const [key, value] of Object.entries(models as Record<string, unknown>)) {
      if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
        validated[key] = value as string[]
      }
    }
    saveCustomModels(validated)
  })

  ipcMain.handle('custom-models:add', (_event, provider: unknown, modelId: unknown) => {
    if (typeof provider !== 'string' || typeof modelId !== 'string') throw new Error('Invalid args')
    addCustomModelId(provider, modelId)
  })

  // ── Session persistence ────────────────────────────────────

  const sessionsDir = join(app.getPath('userData'), 'sessions')

  /** Atomic write: write to temp file, then rename over the target. */
  function atomicSessionWrite(id: string, content: string): void {
    mkdirSync(sessionsDir, { recursive: true })
    const filePath = join(sessionsDir, `${id}.council`)
    const tmpPath = `${filePath}.tmp`
    try {
      writeFileSync(tmpPath, content, 'utf-8')
      renameSync(tmpPath, filePath)
    } catch {
      // Rename failed (e.g., cross-device) — clean up tmp and fall back to direct write
      try { unlinkSync(tmpPath) } catch { /* ignore */ }
      writeFileSync(filePath, content, 'utf-8')
    }
  }

  ipcMain.handle('session:save', (_event, id: unknown, content: unknown) => {
    if (typeof id !== 'string' || typeof content !== 'string') throw new Error('Invalid args')
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid session ID')
    const maxBytes = appConfig.maxSessionSizeMB * 1024 * 1024
    if (content.length > maxBytes) throw new Error(`Session payload exceeds ${appConfig.maxSessionSizeMB}MB limit (configurable in config.json)`)
    atomicSessionWrite(id, content)
  })

  // Synchronous save for beforeunload — blocks renderer until write completes
  ipcMain.on('session:save-sync', (event, id: unknown, content: unknown) => {
    try {
      if (typeof id !== 'string' || typeof content !== 'string') { event.returnValue = false; return }
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) { event.returnValue = false; return }
      const maxBytes = appConfig.maxSessionSizeMB * 1024 * 1024
      if (content.length > maxBytes) { event.returnValue = false; return }
      atomicSessionWrite(id, content)
      event.returnValue = true
    } catch {
      event.returnValue = false
    }
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

    const MAX_FILE_SIZE = appConfig.maxFileAttachmentMB * 1024 * 1024
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
  migrateCustomData()
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
