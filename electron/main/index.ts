import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
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
      sandbox: false,
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

function registerIpcHandlers(): void {
  ipcMain.handle('get-user-data-path', () => app.getPath('userData'))

  ipcMain.handle('read-env-file', () => loadEnvFile())

  ipcMain.handle('write-env-file', (_event, entries: Record<string, string>) => {
    writeEnvFile(entries)
  })

  ipcMain.handle('open-folder', (_event, path: string) => {
    shell.openPath(path)
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
