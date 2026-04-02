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

  catalogPrefsLoad: () => ipcRenderer.invoke('catalog-prefs:load'),
  catalogPrefsSave: (data) => ipcRenderer.invoke('catalog-prefs:save', data),
  openFileDialog: (filters) => ipcRenderer.invoke('dialog:open-file', filters),
  saveFileDialog: (defaultName, content, filters) => ipcRenderer.invoke('dialog:save-file', defaultName, content, filters),
  sessionSave: (id, content) => ipcRenderer.invoke('session:save', id, content),
  sessionLoad: (id) => ipcRenderer.invoke('session:load', id),
  sessionList: () => ipcRenderer.invoke('session:list'),
  sessionDelete: (id) => ipcRenderer.invoke('session:delete', id),
}

contextBridge.exposeInMainWorld('consiliumAPI', api)
