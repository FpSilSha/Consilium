import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join, resolve, normalize, sep, basename, extname } from 'path'
import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, unlinkSync, existsSync } from 'fs'
import { loadEnvFile, writeEnvFile } from './env-loader'
import { loadEncryptedKeys, saveEncryptedKey, deleteEncryptedKey, isEncryptionAvailable, isValidProviderId } from './key-store'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
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

  // ── Session persistence ────────────────────────────────────

  const sessionsDir = join(app.getPath('userData'), 'sessions')

  ipcMain.handle('session:save', (_event, id: unknown, content: unknown) => {
    if (typeof id !== 'string' || typeof content !== 'string') throw new Error('Invalid args')
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid session ID')
    if (content.length > 50_000_000) throw new Error('Session payload exceeds 50MB limit')
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
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
