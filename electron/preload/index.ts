import { contextBridge, ipcRenderer } from 'electron'
import type { ConsiliumAPI } from './types'

const api: ConsiliumAPI = {
  platform: process.platform,

  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),

  readEnvFile: () => ipcRenderer.invoke('read-env-file'),

  writeEnvFile: (entries) => ipcRenderer.invoke('write-env-file', entries),

  openFolder: (path) => ipcRenderer.invoke('open-folder', path),

  keysAvailable: () => ipcRenderer.invoke('keys:available'),
  keysLoad: () => ipcRenderer.invoke('keys:load'),
  keysSave: (providerId, rawKey, metadata) => ipcRenderer.invoke('keys:save', providerId, rawKey, metadata),
  keysDelete: (providerId) => ipcRenderer.invoke('keys:delete', providerId),
}

contextBridge.exposeInMainWorld('consiliumAPI', api)
