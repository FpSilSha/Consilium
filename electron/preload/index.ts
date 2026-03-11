import { contextBridge, ipcRenderer } from 'electron'
import type { ConsiliumAPI } from './types'

const api: ConsiliumAPI = {
  platform: process.platform,

  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),

  readEnvFile: () => ipcRenderer.invoke('read-env-file'),

  writeEnvFile: (entries) => ipcRenderer.invoke('write-env-file', entries),

  openFolder: (path) => ipcRenderer.invoke('open-folder', path),
}

contextBridge.exposeInMainWorld('consiliumAPI', api)
