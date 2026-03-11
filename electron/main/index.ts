import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join, resolve, normalize } from 'path'
import { loadEnvFile, writeEnvFile } from './env-loader'

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

  if (process.env['ELECTRON_RENDERER_URL'] !== undefined) {
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
  return allowedRoots.some((root) => normalized.startsWith(normalize(resolve(root))))
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
